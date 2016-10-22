/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 * @flow
 */

import React, { Component } from 'react';
import {
    AppRegistry,
    StyleSheet,
    Text,
    View
} from 'react-native';
import AtoZList from 'react-native-atoz-list';
import randomcolor from 'randomcolor';
import _ from 'lodash';
let names = require('./names');
names = _.groupBy(require('./names'), (name) => name[0].toUpperCase());

export default class App extends Component {
    constructor(props, context) {
        super(props, context);

        this._renderCell = this._renderCell.bind(this);
        this._renderHeader = this._renderHeader.bind(this);
    }

    _renderHeader(data) {
        return (
            <View style={{ height: 35, justifyContent: 'center', backgroundColor: '#eee', paddingLeft: 10 }}>
                <Text>{data.sectionId}</Text>
            </View>
        )
    }


    _renderCell(data) {
        return (
            <View style={styles.cell}>
                <View style={[styles.placeholderCircle, { backgroundColor: randomcolor() }]} />
                <Text style={styles.name}>
                    {data} {data.split('').reverse().join('')}
                </Text>
            </View>
        );
    }

    render() {
        return (
            <AtoZList
                sectionHeaderHeight={35}
                cellHeight={95}
                data={names}
                renderCell={this._renderCell}
                renderSection={this._renderHeader}
                />
        );
    }
}






const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 25,
        backgroundColor: '#fff',
    },
    swipeContainer: {
    },
    alphabetSidebar: {
        position: 'absolute',
        backgroundColor: 'transparent',
        top: 0,
        bottom: 0,
        right: 0,
        justifyContent: 'center',
        alignItems: 'center',
    },
    placeholderCircle: {
        width: 50,
        height: 50,
        backgroundColor: '#ccc',
        borderRadius: 25,
        marginRight: 10,
        marginLeft: 5,
    },
    name: {
        fontSize: 15,
    },
    cell: {
        height: 95,
        borderBottomColor: '#ccc',
        borderBottomWidth: 1,
        backgroundColor: '#fff',
        flexDirection: 'row',
        alignItems: 'center',
    },
});
