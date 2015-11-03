(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

/* global chrome */

var LIVERELOAD_HOST = 'localhost';
var LIVERELOAD_PORT = 35729;
var connection = new WebSocket('ws://' + LIVERELOAD_HOST + ':' + LIVERELOAD_PORT + '/livereload');

connection.onerror = function (error) {
  console.log('reload connection got error:', error);
};

connection.onmessage = function (e) {
  if (e.data) {
    var data = JSON.parse(e.data);
    if (data && data.command === 'reload') {
      chrome.runtime.reload();
    }
  }
};

},{}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL0FwcERhdGEvUm9hbWluZy9ucG0vbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsImFwcFxcc2NyaXB0cy5iYWJlbFxcY2hyb21lcmVsb2FkLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7OztBQ0VBLElBQU0sZUFBZSxHQUFHLFdBQVcsQ0FBQztBQUNwQyxJQUFNLGVBQWUsR0FBRyxLQUFLLENBQUM7QUFDOUIsSUFBTSxVQUFVLEdBQUcsSUFBSSxTQUFTLENBQUMsT0FBTyxHQUFHLGVBQWUsR0FBRyxHQUFHLEdBQUcsZUFBZSxHQUFHLGFBQWEsQ0FBQyxDQUFDOztBQUVwRyxVQUFVLENBQUMsT0FBTyxHQUFHLFVBQUMsS0FBSyxFQUFLO0FBQzlCLFNBQU8sQ0FBQyxHQUFHLENBQUMsOEJBQThCLEVBQUUsS0FBSyxDQUFDLENBQUM7Q0FDcEQsQ0FBQzs7QUFFRixVQUFVLENBQUMsU0FBUyxHQUFHLFVBQUMsQ0FBQyxFQUFLO0FBQzVCLE1BQUksQ0FBQyxDQUFDLElBQUksRUFBRTtBQUNWLFFBQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ2hDLFFBQUksSUFBSSxJQUFJLElBQUksQ0FBQyxPQUFPLEtBQUssUUFBUSxFQUFFO0FBQ3JDLFlBQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUM7S0FDekI7R0FDRjtDQUNGLENBQUMiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyogZ2xvYmFsIGNocm9tZSAqL1xyXG5cclxuY29uc3QgTElWRVJFTE9BRF9IT1NUID0gJ2xvY2FsaG9zdCc7XHJcbmNvbnN0IExJVkVSRUxPQURfUE9SVCA9IDM1NzI5O1xyXG5jb25zdCBjb25uZWN0aW9uID0gbmV3IFdlYlNvY2tldCgnd3M6Ly8nICsgTElWRVJFTE9BRF9IT1NUICsgJzonICsgTElWRVJFTE9BRF9QT1JUICsgJy9saXZlcmVsb2FkJyk7XHJcblxyXG5jb25uZWN0aW9uLm9uZXJyb3IgPSAoZXJyb3IpID0+IHtcclxuICBjb25zb2xlLmxvZygncmVsb2FkIGNvbm5lY3Rpb24gZ290IGVycm9yOicsIGVycm9yKTtcclxufTtcclxuXHJcbmNvbm5lY3Rpb24ub25tZXNzYWdlID0gKGUpID0+IHtcclxuICBpZiAoZS5kYXRhKSB7XHJcbiAgICBjb25zdCBkYXRhID0gSlNPTi5wYXJzZShlLmRhdGEpO1xyXG4gICAgaWYgKGRhdGEgJiYgZGF0YS5jb21tYW5kID09PSAncmVsb2FkJykge1xyXG4gICAgICBjaHJvbWUucnVudGltZS5yZWxvYWQoKTtcclxuICAgIH1cclxuICB9XHJcbn07XHJcbiJdfQ==
