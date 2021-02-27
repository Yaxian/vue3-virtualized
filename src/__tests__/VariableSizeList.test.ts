import { render } from '@testing-library/vue'

import VariableSizeList from '../VariableSizeList'

const Row = {
  name: 'Row',

  template: `
    <div>Row {{index}}</div>
  `,

  props: {
    index: {
      type: Number,
    },
    rowData: {

    },
  },

}

describe('VariableSizeList', () => {
  it('should render', async () => {
    const itemSize = jest.fn(() => 50)
    const TestComponent = {
      template: `
        <VariableSizeList
          :height="100"
          :item-size="itemSize"
          :item-count="200"
        >
          <template #default="{ data, index, key, isScrolling  }">
            <Row style="border: 1px solid" class="test-row" :index="index" :rowData="data" :isScrolling="isScrolling" />
          </template>
        </VariableSizeList>
      `,
      components: {
        VariableSizeList,
        Row,
      },
      setup() {
        return {
          itemSize,
        }
      },
    }

    const {
      container,
    } = render(TestComponent, {
      props: {

      },
    })

    expect(itemSize).toHaveBeenCalledTimes(4)
    expect(container).toMatchSnapshot()

    /**
     * jsdom doesn't support layout. This means measurements like this will always return 0 as it does here.
     * [issuecomment-481248489](https://github.com/testing-library/react-testing-library/issues/353#issuecomment-481248489)
     */

    // const outer = getByRole('vl-outer')
    // await fireEvent.scroll(outer, {
    //   target: {
    //     scrollTop: 100,
    //   },
    // })

    // await waitFor(() => new Promise(resolve => setTimeout(resolve, 2000)), { timeout: 3000 })
  })
})
