This package is just a fork of the work of brentvatne: https://github.com/brentvatne/fixed-height-windowed-list-view-experiment

I fixed some issues with the scrolling not working correctly and exposed the main listview component as AtoZList.
The scroll performance is great for large lists which is why I switched to using brentvatne's implementation.

##Usage

```js
import AtoZList from 'react-native-atoz-list';

..
...

let myData = {
    'A': [{..}, {...}, {...}],
    'B': [{..}, {..}, {..}],
    'C': [{..}, {..}, {..}],
    ...
    ...
}

render(

    return(
        <AtoZList
                sectionHeaderHeight={20}
                cellHeight={60}
                data={myData}
                renderCell={this._renderCellComponent} 
                renderSection={this._renderSectionComponent}
        />
    );


);

```

##Props
Note: You need to set the section height and cellHeight
sectionHeaderHeight - The height of each header section
cellheight - The height of each cellheight
renderCell - This function will return you cell componenet. It will be passed the objects from each element in the data arrays.
renderSection - This function should render your section headers. It will be passed an object with key 'sectionId'. The value of 'sectionId' will be the keys from your data object. i.e 'A', 'B', 'C' etc..



## Authors

Raheel Govindji <rgovindji@gmail.com>
brentvatne https://github.com/brentvatne