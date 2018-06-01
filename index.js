var stream = require('readable-stream')
var inherits = require('inherits')
var pumpify = require('pumpify')

var DecoderStream = require('./lib/decode')
var EncoderStream = require('./lib/encode')
var FeedStream = require('./lib/feed')

module.exports = ProtocolStream

function ProtocolStream (opts) {
  if (!(this instanceof ProtocolStream)) return new ProtocolStream(opts)
  if (!opts) opts = {}
  this.opts = opts

  stream.Duplex.call(this)

  this._input = opts.decoderStream || DecoderStream(opts)
  this._output = opts.encoderStream || EncoderStream(opts)
  this._feeder = opts.feedStream || FeedStream(opts)

  // Debugging
  /*
  this._input.on('data', function (data) {
    console.log('INPUT:', data)
  })
  this._output.on('data', function (data) {
    console.log('OUTPUT:', data)
  })
  this._feeder.on('data', function (data) {
    console.log('FEEDER OUTPUT:', data)
  })
  */

  // TODO: Reimplement once understood
  /*
  // Set if a timeout is specified
  this._selfHeartbeat = null
  this._remoteHeartbeat = null
  */

  this._pipeline = pumpify(
    this._input,
    this._feeder,
    this._output
  )

  var self = this
  this._output.on('data', function (data) {
    self.push(data)
  })
  this._output.pause()
  this._feeder.on('handshake', function () {
    self.emit('handshake')
  })

  this._firstFeed = true

  if (opts.timeout !== 0 && opts.timeout !== false) {
    this.timeout = opts.timeout
    this.setTimeout(opts.timeout || 5000, this._ontimeout)
  }
}
inherits(ProtocolStream, stream.Duplex)

ProtocolStream.prototype._write = function (data, enc, cb) {
  console.log('WRITING:', data)
  return this._input.write(data, enc, cb)
}

ProtocolStream.prototype._read = function () {
  // Do nothing.
}

ProtocolStream.prototype.setTimeout = function (ms, ontimeout) {
  if (this.destroyed) return
  if (ontimeout) this.once('timeout', ontimeout)
  // TODO: add rest of timeout management.
}

// TODO: Reimplement once understood
/*
ProtocolStream.prototype._createHeartbeatStreams = function (ms) {
  if (!ms) return
  var self = this

  this._selfHeartbeat = HeartbeatStream(ms, 2, ping)
  this._remoteHeartbeat = HeartbeatStream(ms, 4, timeout)

  function ping () {
    self._selfHeartbeat.push(
  }
}
*/

ProtocolStream.prototype._ontimeout = function () {
  this.destroy(new Error('Remote timed out'))
}

ProtocolStream.prototype.feed = function (key, opts) {
  if (this._firstFeed) {
    // TODO: There should be better control-flow here (some way to send a key message).
    this._input.setKey(key)
    this._output.setKey(key)
    this._firstFeed = false
  }
  return this._feeder.feed(key, opts)
}
