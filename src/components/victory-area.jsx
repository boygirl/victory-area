import React from "react";
import Radium from "radium";
import _ from "lodash";
import d3 from "d3";
import log from "../log";
import {VictoryAnimation} from "victory-animation";

class VArea extends React.Component {
  constructor(props) {
    super(props);
    this.getCalculatedValues(props);
  }

  componentWillReceiveProps(nextProps) {
    this.getCalculatedValues(nextProps);
  }

  getCalculatedValues(props) {
    this.style = this.getStyles(props);
    this.stringMap = {
      x: this.createStringMap(props, "x"),
      y: this.createStringMap(props, "y")
    };
    this.datasets = this.consolidateData(props);
    this.range = {
      x: this.getRange(props, "x"),
      y: this.getRange(props, "y")
    };
    this.domain = {
      x: this.getDomain(props, "x"),
      y: this.getDomain(props, "y")
    };
    this.scale = {
      x: this.getScale(props, "x"),
      y: this.getScale(props, "y")
    };
  }

  getStyles(props) {
    return _.merge({
      borderColor: "transparent",
      borderWidth: 0,
      color: "#756f6a",
      opacity: 1,
      margin: 20,
      width: 500,
      height: 300,
    }, props.style);
  }

  createStringMap(props, axis) {
    // if categories exist and are strings, create a map from those strings
    if (props.categories && this._containsStrings(props.categories)) {
      return _.zipObject(_.map(props.categories, (category, index) => {
        return ["" + category, index + 1];
      }));
    }

    // otherwise, collect strings from data sources
    const allStrings = [];
    // collect strings from props.data
    if (props.data) {
      const data = _.isArray(props.data) ? _.flatten(props.data) : props.data;
      const stringData = _.chain(data)
        .pluck(axis)
        .map((datum) => {
          return _.isString(datum) ? datum : null;
        })
        .value();
      allStrings.push(stringData);
    }
    // collect strings from props x or props y
    if (props[axis] && _.isArray(props[axis])) {
      _.each(_.flatten(props[axis]), (element) => {
        if (_.isString(element)) {
          allStrings.push(element);
        }
      });
    }
    // create a unique, sorted set of strings
    const uniqueStrings = _.chain(allStrings)
      .flatten()
      .compact()
      .uniq()
      .sort()
      .value();

    return _.isEmpty(uniqueStrings) ?
      null :
      _.zipObject(_.map(uniqueStrings, (string, index) => {
        return [string, index + 1];
      }));
  }

  _containsStrings(collection) {
    return _.some(collection, function (item) {
      return _.isString(item);
    });
  }

  consolidateData(props) {
    // build all of the types of data into one consistent dataset for easy plotting
    // data can exist as props.data, this.props.x, and this.props.y
    const datasets = [];
    // if no data is passed in, plot a straight line
    const yData = (!props.data && !props.y) ? this.defaultData : props.y;
    // if y is given, construct data for all y, and add it to the dataset
    if (yData) {
      const dataArrays = this.generateDataFromXY(props);
      let attributes;
      _.each(dataArrays, (dataArray, index) => {
        attributes = this._getAttributes(props, "y", index);
        datasets.push(this._formatDataset(dataArray, attributes));
      });
    }
    // if data is given in props.data, add it to the cosolidated datasets
    if (props.data) {
      const dataFromProps = _.isArray(props.data[0]) ? props.data : [props.data];
      let attributes;
      _.each(dataFromProps, (dataset, index) => {
        attributes = this._getAttributes(props, "data", index);
        datasets.push(this._formatDataset(dataset, attributes));
      });
    }
    return datasets;
  }

  _formatDataset(dataset, attributes) {
    return {
      attrs: attributes,
      data: _.map(dataset, (data) => {
        return _.merge(data, {
          // map string data to numeric values, and add names
          x: _.isString(data.x) ? this.stringMap.x[data.x] : data.x,
          xName: _.isString(data.x) ? data.x : undefined,
          y: _.isString(data.y) ? this.stringMap.y[data.y] : data.y,
          yName: _.isString(data.y) ? data.y : undefined
        });
      })
    };
  }

  // https://github.com/FormidableLabs/victory-chart/issues/5
  // helper for consolidateData
  _getAttributes(props, type, index) {
    // type is y or data
    const source = type + "Attributes";
    const attributes = props[source] && props[source][index] ?
      props[source][index] : props[source];
    const requiredAttributes = {
      name: attributes && attributes.name ? attributes.name : "area-" + index,
      type: attributes && attributes.type ? attributes.type : props.areaType
    };
    return _.merge(requiredAttributes, attributes);
  }

  generateXFromDomain(props) {
    //create an array of values evenly spaced across the x domain

    // Determine how to calculate the domain:
    // domain based on props.domain if it is given
    const domainFromProps = (props.domain && props.domain.x) ?
      props.domain.x : props.domain;

    // domain based on tickValues if they are given
    const domainFromTicks = props.tickValues ?
      this._getDomainFromTickValues(props, "x") : undefined;

    // domain based on props.data if it is given
    const domainFromData = props.data ?
      this._getDomainFromDataProps(props) : undefined;

    // domain based on props.scale
    // note: props.scale will never be undefined thanks to default props
    const domainFromScale = props.scale.x ?
      props.scale.x().domain() : props.scale().domain();

    // determine which domain to use in order of preference
    const domain = domainFromProps || domainFromTicks || domainFromData || domainFromScale;
    const samples = this._getNumSamples(props);
    const step = (_.max(domain) - _.min(domain)) / samples;
    // return an array of an array of x values spaced scross the domain,
    // include the maximum of the domain
    return [_.union(_.range(_.min(domain), _.max(domain), step), [_.max(domain)])];
  }

  // helper for generateXFromDomain
  _getDomainFromDataProps(props) {
    const xData = _.pluck(_.flatten(props.data), "x");
    if (this._containsStrings(xData)) {
      const data = _.values(this.stringMap.x);
      return [_.min(data), _.max(data)];
    }
    return [_.min(xData), _.max(xData)];
  }

  // helper for generateXFromDomain
  _getNumSamples(props) {
    // if props.samples is defined, return it:
    if (props.samples) {
      return props.samples;
    }
    // if y props exist and have some sensible length, return that length
    const yArray = _.isArray(props.y) ? props.y : undefined;
    if (yArray && !_.isArray(yArray[0]) && !_.isFunction(yArray[0])) {
      return yArray.length;
    } else if (yArray) {
      const arrayLengths = _.map(yArray, (element) => {
        return _.isArray(element) ? element.length : 0;
      });
      const max = _.max(arrayLengths.concat(0));
      // return a default length of 50 if the number of samples would otherwise
      // be 1 or fewer
      return max > 1 ? max : 50;
    }
  }

  generateDataFromXY(props) {
    // Always return an array of arrays of {x, y} datasets
    // determine possible values of an x array:
    const xFromProps = (props.x && _.isNumber(props.x[0])) ? [props.x] : props.x;
    const xFromStringMap = this.stringMap.x && [_.values(this.stringMap.x)];
    const xFromDomain = this.generateXFromDomain(props);
    let xArrays;
    let xArray;
    let n;

    // determine y
    const y = (!props.data && !props.y) ? this.defaultData : props.y;

    if (_.isFunction(y)) {
      // if y is a function, apply it to each element in each x array
      xArrays = xFromProps || xFromDomain;
      return _.map(xArrays, (xArr) => {
        return _.map(xArr, (x) => {
          return {x, y: y(x)};
        });
      });
    } else if (_.isNumber(y[0])) {
      // if y is an array of numbers, create an object with the first xArray
      xArrays = xFromProps || xFromStringMap || xFromDomain;
      n = _.min([xArrays[0].length, y.length]);
      return _.map(_.take(xArray[0], n), (x, index) => {
        return { x, y: y[index]};
      });
    } else {
      // if y is an array of arrays and/or functions return the arrays,
      // and return the result of applying the functions to corresponding x arrays

      return _.map(y, (yElement, index) => {
        if (_.isArray(yElement)) {
          xArrays = xFromProps || xFromStringMap || xFromDomain;
          xArray = xArrays[index] || xArrays[0];
          n = _.min([xArray.length, yElement.length]);
          return _.map(_.take(xArray, n), (x, i) => {
            return {x, y: yElement[i]};
          });
        } else {
          xArrays = xFromProps || xFromDomain;
          xArray = xArrays[index] || xArrays[0];
          return _.map(xArray, (x) => {
            return {x, y: yElement(x)};
          });
        }
      });
    }
  }

  getScale(props, axis) {
    const scale = props.scale[axis] ? props.scale[axis]().copy() :
      props.scale().copy();
    const range = this.range[axis];
    const domain = this.domain[axis];
    scale.range(range);
    scale.domain(domain);
    // hacky check for identity scale
    if (_.difference(scale.range(), range).length !== 0) {
      // identity scale, reset the domain and range
      scale.range(range);
      scale.domain(range);
    }
    return scale;
  }

  getRange(props, axis) {
    if (props.range) {
      return props.range[axis] ? props.range[axis] : props.range;
    }
    // if the range is not given in props, calculate it from width, height and margin
    return axis === "x" ?
      [this.style.margin, this.style.width - this.style.margin] :
      [this.style.height - this.style.margin, this.style.margin];
  }

  getDomain(props, axis) {
    let domain;
    if (props.domain) {
      domain = props.domain[axis] || props.domain;
    } else if (props.data) {
      domain = this._getDomainFromData(props, axis);
    } else {
      domain = this._getDomainFromScale(props, axis);
    }
    return props.domain ? domain : this._padDomain(props, domain, axis);
  }

  // helper method for getDomain
  _getDomainFromScale(props, axis) {
    // The scale will never be undefined due to default props
    const scaleDomain = props.scale[axis] ? props.scale[axis]().domain() :
      props.scale().domain();

    // Warn when particular types of scales need more information to produce meaningful lines
    if (_.isDate(scaleDomain[0])) {
      log.warn("please specify a domain or data when using time scales");
    } else if (scaleDomain.length === 0) {
      log.warn("please specify a domain or data when using ordinal or quantile scales");
    } else if (scaleDomain.length === 1) {
      log.warn("please specify a domain or data when using a threshold scale");
    }
    return scaleDomain;
  }

  // helper method for getDomain
  _getDomainFromData(props, axis) {
    // if a sensible string map exists, return the minimum and maximum values
    // offset by the bar offset value
    if (this.stringMap[axis] !== null) {
      const mapValues = _.values(this.stringMap[axis]);
      return [_.min(mapValues), _.max(mapValues)];
    } else {
      // find the global min and max
      const allData = _.flatten(_.pluck(this.datasets, "data"));
      const min = _.min(_.pluck(allData, axis));
      const max = _.max(_.pluck(allData, axis));
      // find the cumulative max for stacked chart types
      // this is only sensible for the y domain
      // TODO check assumption
      const cumulativeMax = (props.stacked && axis === "y") ?
        _.reduce(this.datasets, (memo, dataset) => {
          return memo + (_.max(_.pluck(dataset.data, axis)) - _.min(_.pluck(dataset.data, axis)));
        }, 0) : -Infinity;
      return [min, _.max([max, cumulativeMax])];
    }
  }

   _padDomain(props, domain, axis) {
    // don't pad non-numeric domains
    if (_.some(domain, (element) => !_.isNumber(element))) {
      return domain;
    } else if (!props.domainPadding || props.domainPadding[axis] === 0) {
      return domain;
    }
    const min = _.min(domain);
    const max = _.max(domain);
    const rangeExtent = Math.abs(_.max(this.range[axis]) - _.min(this.range[axis]));
    const extent = Math.abs(max - min);
    const percentPadding = props.domainPadding ? props.domainPadding[axis] / rangeExtent : 0;
    const padding = extent * percentPadding;
    const adjustedMin = min === 0 ? min : min - padding;
    const adjustedMax = max === 0 ? max : max + padding;
    return [adjustedMin, adjustedMax];
  }

  getAreaPath(dataset, previousDataset) {
    let y0, v0, v1;
    const xScale = this.scale.x
    const yScale = this.scale.y
    const yExtent = {
      min: yScale(_.min(this.domain.y)),
      max: yScale(_.max(this.domain.y))
    };
    const xExtent = {
      min: xScale(_.min(this.domain.x)),
      max: xScale(_.max(this.domain.x))
    };

    if (this.props.stacked !== true || !previousDataset) {
      y0 = "M " + xExtent.min + "," + yExtent.min + " " +
        "L " + xExtent.max + "," + yExtent.min;
      v0 = "M " + xExtent.min + "," + yExtent.min + " " +
        "L " + xExtent.min + "," + yScale(_.first(dataset.data).y);
      v1 = "M " + xExtent.max + "," + yExtent.min + " " +
        "L " + xExtent.max + "," + yScale(_.last(dataset.data).y);
    } else {
      const previousLineFunction = d3.svg.line()
        .interpolate(previousDataset.interpolation || this.props.interpolation)
        .x((data) => xScale(data.x))
        .y((data) => yScale(data.y));
      y0 = previousLineFunction(previousDataset.data);
      v0 = "M " + xExtent.min + "," + yScale(_.first(previousDataset.data).y) + " " +
        "L " + xExtent.min + "," + yScale(_.first(dataset.data).y);
      v1 = "M " + xExtent.max + "," + yScale(_.last(previousDataset.data).y) + " " +
        "L " + xExtent.max + "," + yScale(_.last(dataset.data).y);
    }
    const lineFunction = d3.svg.line()
      .interpolate(dataset.interpolation || this.props.interpolation)
      .x((data) => xScale(data.x))
      .y((data) => yScale(data.y));
    const y1 = lineFunction(dataset.data);
    console.log(v0, v1)
    return y0 + v0 + y1 + v1;
  }

  getAreaElements(dataset, index) {
    let previousData, path;
    return _.map(this.datasets, (dataset, index) => {
      previousData = index !== 0 && this.datasets[index - 1];
      path = this.getAreaPath(dataset, previousData);
      return (
        <path
          d={path}
          fill={dataset.attrs.color || this.style.color || "blue"}
          key={"area-" + index}
          opacity={dataset.attrs.opacity || this.style.opacity || 1}
          shapeRendering="optimizeSpeed"
          stroke="black"
          strokeWidth={1}>
        </path>
      );
    });
  }


  plotDataPoints() {
    return this.getAreaElements();
  }

  render() {
    if (this.props.containerElement === "svg") {
      return (
        <svg style={this.style}>{this.plotDataPoints()}</svg>
      );
    }
    return (
      <g style={this.style}>{this.plotDataPoints()}</g>
    );
  }
}

@Radium
class VictoryArea extends React.Component {

  render() {
    if (this.props.animate) {
      return (
        <VictoryAnimation data={this.props}>
          {(props) => {
            return (
              <VArea
                {...props}
                stacked={this.props.stacked}
                scale={this.props.scale}
                animate={this.props.animate}
                containerElement={this.props.containerElement}/>
            );
          }}
        </VictoryAnimation>
      );
    }
    return (<VArea {...this.props}/>);
  }
}

const propTypes = {
  /**
   * The data prop specifies the data to be plotted. Data should be in the form of an array
   * of data points, or an array of arrays of data points for multiple datasets.
   * Each data point should be an object with x and y properties.
   * @exampes [
   *   {x: new Date(1982, 1, 1), y: 125},
   *   {x: new Date(1987, 1, 1), y: 257},
   *   {x: new Date(1993, 1, 1), y: 345}
   * ],
   * [
   *   [{x: 5, y: 3}, {x: 4, y: 2}, {x: 3, y: 1}],
   *   [{x: 1, y: 2}, {x: 2, y: 3}, {x: 3, y: 4}],
   *   [{x: 1, y: 2}, {x: 2, y: 2}, {x: 3, y: 2}]
   * ]
   */
  data: React.PropTypes.oneOfType([
    React.PropTypes.arrayOf(
      React.PropTypes.shape({
        x: React.PropTypes.any,
        y: React.PropTypes.any
      })
    ),
    React.PropTypes.arrayOf(
      React.PropTypes.arrayOf(
        React.PropTypes.shape({
          x: React.PropTypes.any,
          y: React.PropTypes.any
        })
      )
    )
  ]),
  /**
   * The dataAttributes prop describes how a data set should be styled.
   * This prop can be given as an object, or an array of objects. If this prop is
   * given as an array of objects, the properties of each object in the array will
   * be applied to the data points in the corresponding array of the data prop.
   * @exampes {color: "blue", opacity: 0.6},
   * [{color: "red"}, {color: "orange"}]
   */
  dataAttributes: React.PropTypes.oneOfType([
    React.PropTypes.object,
    React.PropTypes.arrayOf(React.PropTypes.object)
  ]),
  /**
   * The x props provides another way to supply data for chart to plot. This prop can be given
   * as an array of values or an array of arrays, and it will be plotted against whatever
   * y prop is provided. If no props are provided for y, the values in x will be plotted
   * as the identity function (x) => x.
   * @examples ["apples", "oranges", "bananas"], [[1, 2, 3], [2, 3, 4], [4, 5, 6]]
   */
  x: React.PropTypes.array,
  /**
   * The y props provides another way to supply data for chart to plot. This prop can be given
   * as a function of x, or an array of values, or an array of functions and / or values.
   * if x props are given, they will be used in plotting (x, y) data points. If x props are not
   * provided, a set of x values evenly spaced across the x domain will be calculated, and used
   * for plotting data points.
   * @examples (x) => x + 5, [1, 2, 3], [(x) => x, [2, 3, 4], (x) => Math.sin(x)]
   */
  y: React.PropTypes.oneOfType([
    React.PropTypes.array,
    React.PropTypes.func
  ]),
  /**
   * The yAttributes prop describes how a data set should be plotted and styled.
   * This prop behaves identically to the dataAttributes prop, but is applied to
   * any data provided via the y prop
   * @exampes {type: "scatter", symbol: "square", color: "blue"},
   * [{type: "line", stroke: "green", width: 3}, {type: "bar", color: "orange"}]
   */
  yAttributes: React.PropTypes.oneOfType([
    React.PropTypes.object,
    React.PropTypes.arrayOf(React.PropTypes.object)
  ]),
  /**
   * The samples prop specifies how many individual points to plot when plotting
   * y as a function of x. Samples is ignored if x props are provided instead.
   */
  samples: React.PropTypes.number,
  /**
   * The interpolation prop determines how data points should be connected
   * when plotting a line
   */
  interpolation: React.PropTypes.oneOf([
    "linear",
    "linear-closed",
    "step",
    "step-before",
    "step-after",
    "basis",
    "basis-open",
    "basis-closed",
    "bundle",
    "cardinal",
    "cardinal-open",
    "cardinal-closed",
    "monotone"
  ]),
  /**
   * The domain prop describes the range of values your bar chart will cover. This prop can be
   * given as a array of the minimum and maximum expected values for your bar chart,
   * or as an object that specifies separate arrays for x and y.
   * If this prop is not provided, a domain will be calculated from data, or other
   * available information.
   * @exampes [-1, 1], {x: [0, 100], y: [0, 1]}
   */
  domain: React.PropTypes.oneOfType([
    React.PropTypes.array,
    React.PropTypes.shape({
      x: React.PropTypes.array,
      y: React.PropTypes.array
    })
  ]),
  /**
   * The range prop describes the range of pixels your bar chart will cover. This prop can be
   * given as a array of the minimum and maximum expected values for your bar chart,
   * or as an object that specifies separate arrays for x and y.
   * If this prop is not provided, a range will be calculated based on the height,
   * width, and margin provided in the style prop, or in default styles. It is usually
   * a good idea to let the chart component calculate its own range.
   * @exampes [0, 500], {x: [0, 500], y: [500, 300]}
   */
  range: React.PropTypes.oneOfType([
    React.PropTypes.array,
    React.PropTypes.shape({
      x: React.PropTypes.array,
      y: React.PropTypes.array
    })
  ]),
  /**
   * The scale prop determines which scales your chart should use. This prop can be
   * given as a function, or as an object that specifies separate functions for x and y.
   * @exampes () => d3.time.scale(), {x: () => d3.scale.linear(), y: () => d3.scale.log()}
   */
  scale: React.PropTypes.oneOfType([
    React.PropTypes.func,
    React.PropTypes.shape({
      x: React.PropTypes.func,
      y: React.PropTypes.func
    })
  ]),
  /**
   * The animate prop determines whether the chart should animate with changing data.
   */
  animate: React.PropTypes.bool,
  /**
   * The stacked prop determines whether the chart should consist of stacked bars.
   * When this prop is set to false, grouped bars will be rendered instead.
   */
  stacked: React.PropTypes.bool,
  /**
   * The style prop specifies styles for your chart. VictoryBar relies on Radium,
   * so valid Radium style objects should work for this prop, however height, width, and margin
   * are used to calculate range, and need to be expressed as a number of pixels
   * @example {width: 500, height: 300}
   */
  style: React.PropTypes.node,
  /**
   * The containerElement prop specifies which element the compnent will render.
   * For standalone bars, the containerElement prop should be "svg". If you need to
   * compose bar with other chart components, the containerElement prop should
   * be "g", and will need to be rendered within an svg tag.
   */
  containerElement: React.PropTypes.oneOf(["g", "svg"])
};

const defaultProps = {
  animate: false,
  stacked: false,
  scale: () => d3.scale.linear(),
  containerElement: "svg",
  interpolation: "linear"
};

VictoryArea.propTypes = propTypes;
VictoryArea.defaultProps = defaultProps;
VArea.propTypes = propTypes;
VArea.defaultProps = defaultProps;

export default VictoryArea;
