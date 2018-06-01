var stream = require('readable-stream')
var inherits = require('inherits')
var pumpify = require('pumpify')

var internal = require('./lib/messages/internal')

function ProtocolStream (opts) {
  if (!(this instanceof ProtocolStream)) return new Protocol(opts)
  if (!opts) opts = {}
  this.opts = opts

  stream.Duplex.call(this)
  
  this._input = opts.decoderStream || DecoderStream()
  this._output = opts.encoderStream || EncoderStream()
  this._feeder = opts.feedStream || FeedStream()

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
  this._feeder.on('handshake', function () {
    self.emit('handshake')
  })

  if (opts.timeout !== 0 && opts.timeout !== false) {
    this.timeout = opts.timeout
    this.setTimeout(opts.timeout || 5000, this._ontimeout)
  }
}
inherits(ProtocolStream, stream.Duplex)

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

ProtocolStream.prototype._write = function (data, enc, cb) {
  return this._input.write(data, enc, cb) 
}

ProtocolStream.prototype._read = function (size) {
  return this._output.read(size)
}

ProtocolStream.prototype.feed = function (key, opts) {
  return this._feeder.feed(key, opts)
}
