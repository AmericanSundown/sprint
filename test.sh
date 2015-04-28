#!/bin/bash

browserify test.js -t babelify -t rewireify | node
