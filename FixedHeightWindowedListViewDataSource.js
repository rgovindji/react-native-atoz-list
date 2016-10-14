/**
 * @providesModule FixedHeightWindowedListViewDataSource
 */
'use strict';

import _ from 'lodash';
import invariant from 'fbjs/lib/invariant';

/**
 * Helper class to perform calcuations required by FixedHeightWindowedListView.
 *
 * sectionHeader: Different height from cell, groups cells
 * cell: Content that is not a section header
 * row: A section header or a cell
 *
 */
class FixedHeightListViewDataSource {

  constructor(params) {
    this._dataSource = [];
    this._lookup = {};

    this._getHeightForSectionHeader = params.getHeightForSectionHeader;
    this._getHeightForCell = params.getHeightForCell;
  }

  computeRowsToRender(options) {
    let {
      scrollDirection,
      firstVisible,
      lastVisible,
      firstRendered,
      lastRendered,
      pageSize,
      maxNumToRender,
      numToRenderAhead,
    } = options;

    invariant(
      numToRenderAhead < maxNumToRender,
      `numToRenderAhead must be less than maxNumToRender`,
    );

    let numRendered = lastRendered - firstRendered + 1;
    let lastRow, targetLastRow, firstRow, targetFirstRow;

    if (scrollDirection === 'down') {
      let lastResult = this.__computeLastRow({numRendered, ...options});
      lastRow = lastResult.lastRow;
      targetLastRow = lastResult.targetLastRow;
      let firstResult = this.__computeFirstRow({lastRow, numRendered, ...options});
      firstRow = firstResult.firstRow;
      targetFirstRow = firstResult.targetFirstRow;
    } else if (scrollDirection === 'up') {
      let firstResult = this.__computeFirstRow({numRendered, ...options});
      firstRow = firstResult.firstRow;
      targetFirstRow = firstResult.targetFirstRow;
      let lastResult = this.__computeLastRow({firstRow, numRendered, ...options});
      lastRow = lastResult.lastRow;
      targetLastRow = lastResult.targetLastRow;
    }

    return { firstRow, lastRow, targetFirstRow, targetLastRow };
  }

  __computeFirstRow(options) {
    let {
      lastRow,
      firstVisible,
      lastVisible,
      maxNumToRender,
      numToRenderBehind,
      numToRenderAhead,
      numRendered,
      firstRendered,
      scrollDirection,
      pageSize,
    } = options;

    let firstRow, targetFirstRow;

    if (scrollDirection === 'down') {
      targetFirstRow = firstRow = Math.max(
        0,
        firstVisible - numToRenderBehind, // Never hide the first visible row
        lastRow - maxNumToRender,         // Don't exceed max to render
      );
    } else if (scrollDirection === 'up') {
      targetFirstRow = Math.max(
        0, // Don't render past the top
        firstVisible - numToRenderAhead + numToRenderBehind, // Primary goal -- this is what we need lastVisible for
      );

      firstRow = Math.max(
        targetFirstRow,
        firstRendered - pageSize,
      );
    }

    return { firstRow, targetFirstRow };
  }

  __computeLastRow(options) {
    let {
      firstVisible,
      firstRow,
      numRendered,
      lastVisible,
      totalRows,
      numToRenderBehind,
      numToRenderAhead,
      lastRendered,
      pageSize,
      maxNumToRender,
      scrollDirection,
    } = options;

    let lastRow, targetLastRow;

    if (scrollDirection === 'down') {
      targetLastRow = Math.min(
        totalRows - 1, // Don't render past the bottom
        lastVisible + numToRenderAhead - numToRenderBehind, // Primary goal -- this is what we need lastVisible for
        firstVisible + numRendered + numToRenderAhead - numToRenderBehind, // But don't exceed num to render ahead
      );

      lastRow = Math.min(
        targetLastRow,
        lastRendered + pageSize,
      );
    } else if (scrollDirection === 'up') {
      targetLastRow = lastRow = lastRendered;

      let numToBeRendered = (lastRendered - firstRow);
      if (numToBeRendered > maxNumToRender) {
        targetLastRow = lastRow = targetLastRow - (numToBeRendered - maxNumToRender);
      }
    }

    return { lastRow, targetLastRow };
  }

  /**
   * Public: Used to set the height of the top spacer
   *
   * i - the index of a row in _dataSource
   *
   * Returns the height of spacer before the first rendered row.
   */
  getHeightBeforeRow(i) {
    let height = 0;

    // console.log(this._lookup);
    _.forEach(this._lookup, (section, sectionId) => {
      if (i > section.range[0] && i <= section.range[1]) {
        height += section.sectionHeaderHeight;
        height += ((i - 1) - section.range[0]) * section.cellHeight;
      } else if (section.range[0] < i) {
        height += section.height;
      }
    });

    return height;
  }

  hasSection(sectionId) {
    return !!this._lookup[sectionId];
  }

  getFirstRowOfSection(sectionId) {
    let range = this._lookup[sectionId].range;
    let startY = this._lookup[sectionId].startY;

    return {
      row: range[0],
      startY,
    };
  }

  /**
   * Public: Find the height between index i and index ii, where i < ii
   */
  getHeightBetweenRows(i, ii) {
    if (ii < i) {
      console.warn('provide the lower index first');
    }

    return this.getHeightBeforeRow(ii) - this.getHeightBeforeRow(i + 1);
  }

  /**
   * Public: Used to set the height of the bottom spacer
   *
   * i - the index of a row in _dataSource
   *
   * Returns the height of spacer after the last rendered row.
   */
  getHeightAfterRow(i) {
    return (
      this.getTotalHeight() -
      this.getHeightBeforeRow(i) -
      this.getRowHeight(i)
    );
  }

  /**
   * Public: Used by computeRowsToRender to determine what the target
   * last row is (lastVisible + numToRenderAhead)
   */
  computeVisibleRows(scrollY, viewportHeight) {
    let firstVisible = this.getRowAtHeight(scrollY);
    let lastVisible = this.getRowAtHeight(scrollY + viewportHeight) + 1;

    return {
      firstVisible,
      lastVisible,
    };
  }

  /**
   * Public: Gets the number of rows (cells + section headers)
   *
   * Returns the number of rows.
   */
  getRowCount() {
    return this._dataSource.length;
  }

  /**
   * Public: Gets the data for a cell or header at the given row index
   *
   * Returns whatever is stored in datasource for the given index
   */
  getRowData(i) {
    return this._dataSource[i];
  }

  /**
   * Private: Used internally by computeVisibleRows
   *
   * scrollY - the Y position at the top of the ScrollView
   *
   * Returns the index of the row in the _dataSource array that should be
   * rendered at the given scrollY.
   */
  getRowAtHeight(scrollY) {
    if (scrollY < 0) {
      return 0;
    } else if (scrollY > this.getTotalHeight()) {
      return Math.max(this.getRowCount() - 1, 0);
    }

    let parentSection = _.find(this._lookup, (value) => {
      return scrollY >= value.startY && scrollY <= value.endY;
    });

    let relativeY = scrollY - parentSection.startY;

    if (relativeY <= parentSection.sectionHeaderHeight) {
      return parentSection.range[0];
    } else {
      let i = Math.floor(
        (relativeY - parentSection.sectionHeaderHeight) /
        parentSection.cellHeight
      );
      return parentSection.range[0] + i;
    }
  }

  getRowHeight(i) {
    let row = this._dataSource[i];

    if (row && _.isObject(row) && row.sectionId) {
      return this.getSectionHeaderHeight(row.sectionId);
    } else {
      return this.getCellHeight(i);
    }
  }

  getSectionHeaderHeight(sectionId) {
    return this._lookup[sectionId].sectionHeaderHeight;
  }

  getCellHeight(i) {
    let parentSection = this.getParentSection(i);

    if (parentSection) {
      return parentSection.cellHeight;
    }
  }

  getSectionId(i) {
    return this.getParentSection(i).sectionId;
  }

  getParentSection(i) {
    return _.find(this._lookup, (section) => {
      return i >= section.range[0] && i <= section.range[1];
    });
  }

  getTotalHeight() {
    let keys = Object.keys(this._lookup);
    let lastSection = this._lookup[keys[keys.length - 1]];

    if (lastSection) {
      return lastSection.endY;
    } else {
      return 0;
    }
  }

  cloneWithCellsAndSections(dataBlob, sectionIds = Object.keys(dataBlob)) {
    /* Take in { 'A': [{..}, {..}], 'B': [{..}]} and turn it into
     *         [ { sectionId: 'A' }, {..}, {..}, { sectionId: 'B' }, {..} ]
     *
     * This is important because we want to treat section headers just as
     * other rows.
     */
    this._dataSource = [];
    let sectionIdsPresent = [];

    sectionIds.forEach((sectionId) => {
      if (dataBlob[sectionId]) {
        this._dataSource.push({ sectionId }, ...dataBlob[sectionId]);
        sectionIdsPresent.push(sectionId);
      }
    });

    /* Build a data structure like this so we can easily perform calculations we
     * need later:
     * { 'A': { rows: 2, range: [0, 2], height: 250, startY: 0, endY: 250, cellHeight: 95, sectionHeaderHeight: 35} }
     */
    let lastRow = -1;
    let cumulativeHeight = 0;
    this._lookup = sectionIdsPresent.reduce((result, sectionId) => {
      let sectionHeaderHeight = this._getHeightForSectionHeader(sectionId);
      let cellHeight = this._getHeightForCell(sectionId);
      let count = dataBlob[sectionId].length;
      let sectionHeight = sectionHeaderHeight + cellHeight * count;

      result[sectionId] = {
        count: count + 1,                          // Factor in section header
        range: [lastRow + 1, lastRow + 1 + count], // Move 1 ahead of previous last row
        height: sectionHeight,
        startY: cumulativeHeight,
        endY: cumulativeHeight + sectionHeight,
        cellHeight,
        sectionHeaderHeight,
        sectionId,
      };

      cumulativeHeight += sectionHeight;
      lastRow = lastRow + 1 + count;

      return result;
    }, {});

    return this;
  }

  getHeightOfSection(sectionId) {
    return this._lookup[sectionId].height;
  }

  /**
   * Returns an array containing the number of rows in each section
   */
  getSectionLengths() {
    let result = [];
    _.forEach(this._lookup, value => {
      result.push(value.count);
    });
    return result;
  }
}

module.exports = FixedHeightListViewDataSource;
