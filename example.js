/* eslint-disable no-console */

var Nightmare = require('nightmare')
var nightmare = Nightmare({ show: true })

nightmare
  .goto('http://queridin.com')
  .wait(10000)
  .evaluate(function() {
    //return document.querySelector('#main .searchCenterMiddle li a').href
  })
  .end()
  .then(function(result) {
    console.log(result)
  })
  .catch(function(error) {
    console.error('Search failed:', error)
  })
