/**
 * @providesModule FixedHeightWindowedListView
 */
'use strict';

import React, { Component } from 'react'
import PropTypes from 'prop-types';
import {
  Platform,
  ScrollView,
  Text,
  View,
  Dimensions,
} from 'react-native';

import FixedHeightWindowedListViewDataSource from './FixedHeightWindowedListViewDataSource';
import clamp from './clamp';
import deepDiffer from './deepDiffer';
import invariant from './invariant';
import _ from 'lodash';

/**
 * An experimental ListView implementation that only renders a subset of rows of
 * a potentially very large set of data.
 *
 * Row data should be provided as a simple array corresponding to rows. `===`
 * is used to determine if a row has changed and should be re-rendered.
 *
 * Rendering is done incrementally by row to minimize the amount of work done
 * per JS event tick.
 *
 * Rows must have a pre-determined height, thus FixedHeight. The height
 * of the rows can vary depending on the section that they are in.
 */
export default class FixedHeightWindowedListView extends Component {

  constructor(props, context) {
    super(props, context);

    invariant(
      this.props.numToRenderAhead < this.props.maxNumToRender,
      'FixedHeightWindowedListView: numToRenderAhead must be less than maxNumToRender'
    );

    invariant(
      this.props.numToRenderBehind < this.props.maxNumToRender,
      'FixedHeightWindowedListView: numToRenderBehind must be less than maxNumToRender'
    );

    this.__onScroll = this.__onScroll.bind(this);
    this.__enqueueComputeRowsToRender = this.__enqueueComputeRowsToRender.bind(this);
    this.__computeRowsToRenderSync = this.__computeRowsToRenderSync.bind(this);
    this.scrollOffsetY = 0;
    this.height = 0;
    this.willComputeRowsToRender = false;
    this.timeoutHandle = 0;
    this.nextSectionToScrollTo = null;
    this.scrollDirection = 'down';

    let { dataSource, initialNumToRender } = this.props;

    this.state = {
      firstRow: 0,
      lastRow: Math.min(dataSource.getRowCount() - 1, initialNumToRender),
      bufferFirstRow: null,
      bufferLastRow: null,
    };
  }

  componentWillReceiveProps(nextProps) {
    this.__computeRowsToRenderSync(nextProps, true);
  }

  componentWillUnmount() {
    clearTimeout(this.timeoutHandle);
  }

  render() {
    this.__rowCache = this.__rowCache || {};

    let { bufferFirstRow, bufferLastRow } = this.state;
    let { firstRow, lastRow } = this.state;
    let { spacerTopHeight, spacerBottomHeight, spacerMidHeight } = this.__calculateSpacers();

    let rows = [];
    rows.push(<View key="sp-top" style={{height: spacerTopHeight}} />);

    if (bufferFirstRow < firstRow && bufferFirstRow !== null) {
      bufferLastRow = clamp(0, bufferLastRow, firstRow - 1);
      this.__renderCells(rows, bufferFirstRow, bufferLastRow);

      // It turns out that this isn't needed, we don't really care about what
      // is rendered after in this case because it will be immediately replaced
      // with the non-buffered window. Leaving this in can sometimes lead to
      // white screen flashes on Android.
      // rows.push(<View key="sp-mid" style={{height: spacerMidHeight}} />);
    }

    this.__renderCells(rows, firstRow, lastRow);

    if (bufferFirstRow > lastRow && bufferFirstRow !== null) {
      rows.push(<View key="sp-mid" style={{height: spacerMidHeight}} />);
      this.__renderCells(rows, bufferFirstRow, bufferLastRow);
    }

    let totalRows = this.props.dataSource.getRowCount();
    rows.push(<View key="sp-bot" style={{height: spacerBottomHeight}} />);

    return (
      <ScrollView
        scrollEventThrottle={50}
        removeClippedSubviews={this.props.numToRenderAhead === 0 ? false : true}
        automaticallyAdjustContentInsets={false}
        {...this.props}
        ref={(ref) => { this.scrollRef = ref; }}
        onScroll={this.__onScroll}>
        {rows}
      </ScrollView>
    );
  }

  getScrollResponder() {
    return this.scrollRef &&
      this.scrollRef.getScrollResponder &&
      this.scrollRef.getScrollResponder();
  }

  scrollToSectionBuffered(sectionId) {
    if (!this.isScrollingToSection && this.props.dataSource.hasSection(sectionId)) {
      let { row, startY } = this.props.dataSource.getFirstRowOfSection(sectionId);
      let { initialNumToRender, numToRenderBehind } = this.props;
      let totalRows = this.props.dataSource.getRowCount();
      let lastRow = totalRows - 1;

      // We don't want to run computeRowsToRenderSync while scrolling
      this.__clearEnqueuedComputation();
      this.isScrollingToSection = true;

      let windowFirstRow = row;
      let windowLastRow = Math.min(lastRow, row + initialNumToRender);

      // If we are at the bottom of the list, subtract any left over rows from the firstRow
      if (windowLastRow - lastRow === 0) {
        windowFirstRow = Math.max(0, windowLastRow - initialNumToRender);
      }

      // Set up the buffer
      this.setState({
        bufferFirstRow: windowFirstRow,
        bufferLastRow: windowLastRow,
      }, () => {
        this.__maybeWait(() => {
          this.setState({
            firstRow: windowFirstRow,
            lastRow: windowLastRow,
            bufferFirstRow: null,
            bufferLastRow: null,
          }, () => {
            if (this.nextSectionToScrollTo !== null) {
              requestAnimationFrame(() => {
                let nextSectionID = this.nextSectionToScrollTo;
                this.nextSectionToScrollTo = null;
                this.isScrollingToSection = false;
                this.scrollToSectionBuffered(nextSectionID);
              });
            } else {
              // On Android it seems like it is possible for the scroll
              // position to be reported incorrectly sometimes, so we
              // delay setting isScrollingToSection to false here to
              // give it more time for the scroll position to catch up (?)
              // which is important for calculating the firstVisible and
              // lastVisible, ultimately determining rows to render.
              // Leaving this out sometimes causes a blank screen briefly,
              // with the firstRow exceeding lastRow.
              setTimeout(() => {
                this.isScrollingToSection = false;
                this.__clearEnqueuedComputation();
                this.__enqueueComputeRowsToRender();
              }, 100);
            }
          });
        });
      });

      // Scroll to the buffer area as soon as setState is complete
      this.scrollRef.scrollTo({ y: startY, animated: false });
      //  this.scrollRef.scrollTo({x: 0, y: startY, animation: false});
    } else {
      this.nextSectionToScrollTo = sectionId; // Only keep the most recent value
    }
  }

  scrollWithoutAnimationTo(destY, destX) {
    this.scrollRef &&
      this.scrollRef.scrollTo({ y: destY, x: destX, animated: false });

  }

  // Android requires us to wait a frame between setting the buffer, scrolling
  // to it, and then setting the firstRow and lastRow to the buffer. If not,
  // white flash. iOS doesnt't care.
  __maybeWait(callback) {
    if (Platform.OS === 'android') {
      requestAnimationFrame(() => {
        callback();
      });
    } else {
      callback();
    }
  }

  __renderCells(rows, firstRow, lastRow) {
    for (var idx = firstRow; idx <= lastRow; idx++) {
      let data = this.props.dataSource.getRowData(idx);
      let id = idx.toString();
      let parentSectionId = '';

      // TODO: generalize this!
      if (data && data.get && data.get('guid_token')) {
        id = data.get('guid_token');
      }

      let key = id;

      if (!(data && _.isObject(data) && data.sectionId)) {
        parentSectionId = this.props.dataSource.getSectionId(idx)
        key = `${key}-${id}`;
      }

      rows.push(
        <CellRenderer
          key={key}
          shouldUpdate={data !== this.__rowCache[key]}
          render={this.__renderRow.bind(this, data, parentSectionId, idx, key)}
        />
      );

      this.__rowCache[key] = data;
    }
  }

  __renderRow(data, parentSectionId, idx, key) {
    if (data && _.isObject(data) && data.sectionId) {
      return this.props.renderSectionHeader(data, null, idx, key);
    } else {
      return this.props.renderCell(data, parentSectionId, idx, key);
    }
  }

  __onScroll(e) {
    this.prevScrollOffsetY = this.scrollOffsetY || 0;
    this.scrollOffsetY = e.nativeEvent.contentOffset.y;
    this.scrollDirection = this.__getScrollDirection();
    this.height = e.nativeEvent.layoutMeasurement.height;
    this.__enqueueComputeRowsToRender();

    if (this.props.onEndReached) {
      const windowHeight = Dimensions.get('window').height;
      const { height } = e.nativeEvent.contentSize;
      const offset = e.nativeEvent.contentOffset.y;

      if( windowHeight + offset >= height ){
        // ScrollEnd
        this.props.onEndReached(e);
      }
    }
  }

  __getScrollDirection() {
    if (this.scrollOffsetY - this.prevScrollOffsetY >= 0) {
      return 'down';
    } else {
      return 'up';
    }
  }

  __clearEnqueuedComputation() {
    clearTimeout(this.timeoutHandle);
    this.willComputeRowsToRender = false;
  }

  __enqueueComputeRowsToRender() {
    if (!this.willComputeRowsToRender) {
      this.willComputeRowsToRender = true; // batch up computations
      clearTimeout(this.timeoutHandle);

      this.timeoutHandle = setTimeout(() => {
        this.willComputeRowsToRender = false;
        this.__computeRowsToRenderSync(this.props);
      }, this.props.incrementDelay);
    }
  }

  /**
   * The result of this is an up-to-date state of firstRow and lastRow, given
   * the viewport.
   */
  __computeRowsToRenderSync(props, forceUpdate = false) {
    if (this.props.bufferFirstRow === 0 || this.props.bufferFirstRow > 0 || this.isScrollingToSection) {
      requestAnimationFrame(() => {
        this.__computeRowsToRenderSync(this.props);
      });
      return;
    }

    let { dataSource } = this.props;
    let totalRows = dataSource.getRowCount();

    if (totalRows === 0) {
      this.setState({ firstRow: 0, lastRow: -1 });
      return;
    }

    if (this.props.numToRenderAhead === 0) {
      return;
    }

    let { firstVisible, lastVisible } = dataSource.computeVisibleRows(
      this.scrollOffsetY,
      this.height,
    );

    if ((lastVisible >= totalRows - 1) && !forceUpdate) {
      return;
    }

    let scrollDirection = this.props.isTouchingSectionPicker ? 'down' : this.scrollDirection;

    let { firstRow, lastRow, targetFirstRow, targetLastRow } = dataSource.computeRowsToRender({
      scrollDirection,
      firstVisible,
      lastVisible,
      firstRendered: this.state.firstRow,
      lastRendered: this.state.lastRow,
      maxNumToRender: props.maxNumToRender,
      pageSize: props.pageSize,
      numToRenderAhead: props.numToRenderAhead,
      numToRenderBehind: props.numToRenderBehind,
      totalRows,
    });

    this.setState({firstRow, lastRow});

    // Keep enqueuing updates until we reach the targetLastRow or
    // targetFirstRow
    if (lastRow !== targetLastRow || firstRow !== targetFirstRow) {
      this.__enqueueComputeRowsToRender();
    }
  }

  /**
   * TODO: pull this out into data source, add tests
   */
  __calculateSpacers() {
    let { bufferFirstRow, bufferLastRow } = this.state;
    let { firstRow, lastRow } = this.state;

    let spacerTopHeight = this.props.dataSource.getHeightBeforeRow(firstRow);
    let spacerBottomHeight = this.props.dataSource.getHeightAfterRow(lastRow);
    let spacerMidHeight;

    if (bufferFirstRow !== null && bufferFirstRow < firstRow) {
      spacerMidHeight = this.props.dataSource.
        getHeightBetweenRows(bufferLastRow, firstRow);

      let bufferHeight = this.props.dataSource.
        getHeightBetweenRows(bufferFirstRow - 1, bufferLastRow + 1);

      spacerTopHeight -= (spacerMidHeight + bufferHeight);
    } else if (bufferFirstRow !== null && bufferFirstRow > lastRow) {
      spacerMidHeight = this.props.dataSource.
        getHeightBetweenRows(lastRow, bufferFirstRow);

      spacerBottomHeight -= spacerMidHeight;
    }

    return {
      spacerTopHeight,
      spacerBottomHeight,
      spacerMidHeight,
    }
  }
}

FixedHeightWindowedListView.DataSource = FixedHeightWindowedListViewDataSource;

FixedHeightWindowedListView.propTypes = {
  dataSource: PropTypes.object.isRequired,
  renderCell: PropTypes.func.isRequired,
  renderSectionHeader: PropTypes.func,
  incrementDelay: PropTypes.number,
  initialNumToRender: PropTypes.number,
  maxNumToRender: PropTypes.number,
  numToRenderAhead: PropTypes.number,
  numToRenderBehind: PropTypes.number,
  pageSize: PropTypes.number,
  onEndReached: PropTypes.func,
};

FixedHeightWindowedListView.defaultProps = {
  incrementDelay: 17,
  initialNumToRender: 1,
  maxNumToRender: 20,
  numToRenderAhead: 4,
  numToRenderBehind: 2,
  pageSize: 5,
};

const DEBUG = false;

class CellRenderer extends React.Component {
  shouldComponentUpdate(newProps) {
    return newProps.shouldUpdate;
  }

  render() {
    return this.props.render()
  }
}

CellRenderer.propTypes = {
  shouldUpdate: PropTypes.bool,
  render: PropTypes.func,
};
