var consts = require('./consts')
var protocol = require('../messages/protocol')

var encodings = {}
Object.keys(consts.Protocol).forEach(function (name) {
  encodings[consts.Protocol[name]] = protocol[name]
})

module.exports = encodings
