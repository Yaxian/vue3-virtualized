import { h } from 'vue'

import memoizeOne from 'memoize-one'
import styleToObject from 'style-to-object'
import { cancelTimeout, requestTimeout } from './timer'
import { getRTLOffsetType } from './domHelpers'


const IS_SCROLLING_DEBOUNCE_INTERVAL = 150

const defaultItemKey = (index, data) => index

// In DEV mode, this Set helps us only log a warning once per component instance.
// This avoids spamming the console every time a render happens.
let devWarningsDirection = null
let devWarningsTagName = null
if (process.env.NODE_ENV !== 'production') {
  if (typeof window !== 'undefined' && typeof window.WeakSet !== 'undefined') {
    devWarningsDirection = new WeakSet()
    devWarningsTagName = new WeakSet()
  }
}

// NOTE: I considered further wrapping individual items with a pure ListItem component.
// This would avoid ever calling the render function for the same index more than once,
// But it would also add the overhead of a lot of components/fibers.
// I assume people already do this (render function returning a class component),
// So my doing it would just unnecessarily double the wrappers.

const validateSharedProps = (
  {
    direction,
    height,
    layout,
    innerTagName,
    outerTagName,
  },
  { instance },
) => {
  if (process.env.NODE_ENV !== 'production') {
    if (innerTagName != null || outerTagName != null) {
      if (devWarningsTagName && !devWarningsTagName.has(instance)) {
        devWarningsTagName.add(instance)
        console.warn(
          'The innerTagName and outerTagName props have been deprecated. '
            + 'Please use the innerElementType and outerElementType props instead.',
        )
      }
    }

    switch (direction) {
      case 'vertical':
        if (devWarningsDirection && !devWarningsDirection.has(instance)) {
          devWarningsDirection.add(instance)
          console.warn(
            'The direction prop should be either "ltr" (default) or "rtl". '
              + 'Please use the layout prop to specify "vertical" (default) or "horizontal" orientation.',
          )
        }
        break
      case 'ltr':
      case 'rtl':
        // Valid values
        break
      default:
        throw Error(
          'An invalid "direction" prop has been specified. '
            + 'Value should be either "ltr" or "rtl". '
            + `"${direction}" was specified.`,
        )
    }

    switch (layout) {
      case 'horizontal':
      case 'vertical':
        // Valid values
        break
      default:
        throw Error(
          'An invalid "layout" prop has been specified. '
            + 'Value should be either "horizontal" or "vertical". '
            + `"${layout}" was specified.`,
        )
    }

    if (typeof height !== 'number') {
      throw Error(
        'An invalid "height" prop has been specified. '
          + 'Vertical lists must specify a number for height. '
          + `"${height === null ? 'null' : typeof height}" was specified.`,
      )
    }
  }
}

export default function createListComponent({
  getItemOffset,
  getEstimatedTotalSize,
  getItemSize,
  getOffsetForIndexAndAlignment,
  getStartIndexForOffset,
  getStopIndexForStartIndex,
  initInstanceProps,
  shouldResetStyleCacheOnItemSizeChange,
  validateProps,
}) {
  const List = {
    inheritAttrs: false,
    props: {
      layout: {
        type: String,
        default: 'vertical',
      },
      direction: {
        type: String,
        default: 'ltr',
      },
      overscanCount: {
        type: Number,
        default: 2,
      },
      useIsScrolling: {
        type: Boolean,
        default: false,
      },
      height: {
        type: [String, Number],
      },
      initialScrollOffset: {
        type: Number,
      },
      innerRef: {
        type: Object,
      },
      innerElementType: {
        type: Object,
      },
      innerTagName: {}, // deprecated
      itemCount: {
        type: Number,
      },
      itemData: {
        type: Object,
      },
      itemKey: {
        type: Function,
      },
      itemSize: {
        type: [Number, Function],
      },

      onItemsRendered: {
        type: Function,
      },
      onScroll: {
        type: Function,
      },
      outerRef: {
        type: Object,
      },
      outerElementType: {
        type: Object,
      },
      outerTagName: {
        type: String,
      }, // deprecated

      width: {
        type: [Number, String],
      },
    },

    data() {
      return {
        instance: this,
        isScrolling: false,
        scrollDirection: 'forward',
        scrollOffset:
          typeof this.initialScrollOffset === 'number'
            ? this.initialScrollOffset
            : 0,
        scrollUpdateWasRequested: false,
        _instanceProps: initInstanceProps(this, this),
        _outerRef: null,
        _resetIsScrollingTimeoutId: null,
      }
    },

    created() {
      this._callOnItemsRendered = memoizeOne(
        (
          overscanStartIndex,
          overscanStopIndex,
          visibleStartIndex,
          visibleStopIndex,
        ) => this.onItemsRendered({
          overscanStartIndex,
          overscanStopIndex,
          visibleStartIndex,
          visibleStopIndex,
        }),
      )

      this._callOnScroll = memoizeOne(
        (
          scrollDirection,
          scrollOffset,
          scrollUpdateWasRequested,
        ) => this.onScroll({
          scrollDirection,
          scrollOffset,
          scrollUpdateWasRequested,
        }),
      )

      this._getItemStyleCache = memoizeOne(() => ({}))
    },

    methods: {
      scrollToItem(index, align) {
        const { itemCount } = this
        const { scrollOffset } = this

        index = Math.max(0, Math.min(index, itemCount - 1))

        this.scrollTo(
          getOffsetForIndexAndAlignment(
            this,
            index,
            align,
            scrollOffset,
            this._instanceProps,
          ),
        )
      },

      _callPropsCallbacks() {
        if (typeof this.onItemsRendered === 'function') {
          const { itemCount } = this
          if (itemCount > 0) {
            const [
              overscanStartIndex,
              overscanStopIndex,
              visibleStartIndex,
              visibleStopIndex,
            ] = this._getRangeToRender()
            this._callOnItemsRendered(
              overscanStartIndex,
              overscanStopIndex,
              visibleStartIndex,
              visibleStopIndex,
            )
          }
        }

        if (typeof this.onScroll === 'function') {
          const {
            scrollDirection,
            scrollOffset,
            scrollUpdateWasRequested,
          } = this
          this._callOnScroll(
            scrollDirection,
            scrollOffset,
            scrollUpdateWasRequested,
          )
        }
      },

      // Lazily create and cache item styles while scrolling,
      // So that pure component sCU will prevent re-renders.
      // We maintain this cache, and pass a style prop rather than index,
      // So that List can clear cached styles and force item re-render if necessary.
      _getItemStyle(index) {
        const { direction, itemSize, layout } = this

        const itemStyleCache = this._getItemStyleCache(
          shouldResetStyleCacheOnItemSizeChange && itemSize,
          shouldResetStyleCacheOnItemSizeChange && layout,
          shouldResetStyleCacheOnItemSizeChange && direction,
        )

        let style
        if (itemStyleCache.hasOwnProperty(index)) {
          style = itemStyleCache[index]
        } else {
          const offset = getItemOffset(this, index, this._instanceProps)
          const size = getItemSize(this, index, this._instanceProps)

          const isRtl = direction === 'rtl'
          const offsetHorizontal = 0
          style = {
            position: 'absolute',
            left: isRtl ? undefined : `${offsetHorizontal}px`,
            right: isRtl ? offsetHorizontal : undefined,
            top: `${offset}px`,
            height: `${size}px`,
            width: '100%',
          }
          itemStyleCache[index] = style
        }

        return style
      },

      _getRangeToRender() {
        const { itemCount, overscanCount } = this
        const { isScrolling, scrollDirection, scrollOffset } = this

        if (itemCount === 0) {
          return [0, 0, 0, 0]
        }

        const startIndex = getStartIndexForOffset(
          this,
          scrollOffset,
          this._instanceProps,
        )
        const stopIndex = getStopIndexForStartIndex(
          this,
          startIndex,
          scrollOffset,
          this._instanceProps,
        )

        // Overscan by one item in each direction so that tab/focus works.
        // If there isn't at least one extra item, tab loops back around.
        const overscanBackward = !isScrolling || scrollDirection === 'backward'
          ? Math.max(1, overscanCount)
          : 1
        const overscanForward = !isScrolling || scrollDirection === 'forward'
          ? Math.max(1, overscanCount)
          : 1

        return [
          Math.max(0, startIndex - overscanBackward),
          Math.max(0, Math.min(itemCount - 1, stopIndex + overscanForward)),
          startIndex,
          stopIndex,
        ]
      },

      _onScrollVertical(event) {
        const { clientHeight, scrollHeight, scrollTop } = event.target

        if (this.scrollOffset === scrollTop) {
          return
        }

        const scrollOffset = Math.max(
          0,
          Math.min(scrollTop, scrollHeight - clientHeight),
        )

        this.isScrolling = true
        this.scrollDirection = this.scrollOffset < scrollOffset ? 'forward' : 'backward'
        this.scrollOffset = scrollOffset
        this.scrollUpdateWasRequested = false

        this.$nextTick(() => {
          this._resetIsScrollingDebounced()
        })
      },

      _outerRefSetter(ref) {
        const { outerRef } = this

        this._outerRef = ((ref))

        if (typeof outerRef === 'function') {
          outerRef(ref)
        } else if (
          outerRef != null
          && typeof outerRef === 'object'
          && outerRef.hasOwnProperty('current')
        ) {
          outerRef.current = ref
        }
      },

      _resetIsScrollingDebounced() {
        if (this._resetIsScrollingTimeoutId !== null) {
          cancelTimeout(this._resetIsScrollingTimeoutId)
        }

        this._resetIsScrollingTimeoutId = requestTimeout(
          this._resetIsScrolling,
          IS_SCROLLING_DEBOUNCE_INTERVAL,
        )
      },

      _resetIsScrolling() {
        this._resetIsScrollingTimeoutId = null

        this.isScrolling = false
        this.$nextTick(() => {
          this._getItemStyleCache(-1, null)
        })
      },

      scrollTo(scrollOffset) {
        const newScrollOffset = Math.max(0, scrollOffset)

        if (this.scrollOffset === newScrollOffset) {
          return
        }

        this.scrollDirection = this.scrollOffset < newScrollOffset ? 'forward' : 'backward'
        this.scrollOffset = newScrollOffset
        this.scrollUpdateWasRequested = true

        this.$nextTick(() => {
          this._resetIsScrollingDebounced()
        })
      },
    },

    beforeUpdate() {
      validateSharedProps(this, this)
      validateProps(this)
      return null
    },

    mounted() {
      const { direction, initialScrollOffset, layout } = this

      if (typeof initialScrollOffset === 'number' && this._outerRef != null) {
        const outerRef = this._outerRef
        // TODO Deprecate direction "horizontal"
        if (direction === 'horizontal' || layout === 'horizontal') {
          outerRef.scrollLeft = initialScrollOffset
        } else {
          outerRef.scrollTop = initialScrollOffset
        }
      }

      this._callPropsCallbacks()
    },

    updated() {
      const { direction, layout } = this
      const { scrollOffset, scrollUpdateWasRequested } = this

      if (scrollUpdateWasRequested && this._outerRef != null) {
        const outerRef = ((this._outerRef))

        // TODO Deprecate direction "horizontal"
        if (direction === 'horizontal' || layout === 'horizontal') {
          if (direction === 'rtl') {
            // TRICKY According to the spec, scrollLeft should be negative for RTL aligned elements.
            // This is not the case for all browsers though (e.g. Chrome reports values as positive, measured relative to the left).
            // So we need to determine which browser behavior we're dealing with, and mimic it.
            switch (getRTLOffsetType()) {
              case 'negative':
                outerRef.scrollLeft = -scrollOffset
                break
              case 'positive-ascending':
                outerRef.scrollLeft = scrollOffset
                break
              default: {
                const { clientWidth, scrollWidth } = outerRef
                outerRef.scrollLeft = scrollWidth - clientWidth - scrollOffset
                break
              }
            }
          } else {
            outerRef.scrollLeft = scrollOffset
          }
        } else {
          outerRef.scrollTop = scrollOffset
        }
      }

      this._callPropsCallbacks()
    },

    beforeUnmount() {
      if (this._resetIsScrollingTimeoutId !== null) {
        cancelTimeout(this._resetIsScrollingTimeoutId)
      }
    },

    render(context) {
      const {
        direction,
        height,
        innerRef,
        innerElementType,
        innerTagName,
        itemCount,
        itemData,
        itemKey = defaultItemKey,
        outerElementType,
        outerTagName,
        useIsScrolling,
        width,
      } = context
      const { isScrolling } = this

      const onScroll = this._onScrollVertical

      const [startIndex, stopIndex] = this._getRangeToRender()

      const items = []
      if (itemCount > 0) {
        for (let index = startIndex; index <= stopIndex; index++) {
          const itemStyle = this._getItemStyle(index)
          const vnode = context.$slots.default({
            data: itemData,
            key: itemKey(index, itemData),
            index,
            isScrolling: useIsScrolling ? isScrolling : undefined,
          })
          vnode[0].props.style = {
            ...(vnode[0].props.style || {}),
            ...itemStyle
          }
          items.push(vnode)
        }
      }

      // Read this value AFTER items have been created,
      // So their actual sizes (if variable) are taken into consideration.
      const estimatedTotalSize = getEstimatedTotalSize(
        this,
        this._instanceProps,
      )

      const vnode =  h(
        outerElementType || outerTagName || 'div',
        {
          role: 'vl-outer',
          ...context.$attrs,
          onScroll,
          ref: this._outerRefSetter,
          style: {
            position: 'relative',
            overflow: 'auto',
            WebkitOverflowScrolling: 'touch',
            willChange: 'transform',
            height: `${height}px`,
            width: `${width}`.includes('%') ? `${width}` : `${width}px`,
            direction,
            ...styleToObject(context.$attrs.style)
          },
        },
        h(innerElementType || innerTagName || 'div', {
          ref: innerRef,
          style: {
            height: `${estimatedTotalSize}px`,
            pointerEvents: isScrolling ? 'none' : undefined,
            width: '100%',
          }
        }, items),
      )

      return vnode
    },

  }

  return List
}
