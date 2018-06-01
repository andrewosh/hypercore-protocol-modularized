var stream = require('readable-stream')
var inherits = require('inherits')
var sodium = require('sodium-universal')
var varint = require('varint')

var consts = require('./common/consts')
var errors = require('./common/errors')
var protocol = require('./messages/protocol')

module.exports = DecoderStream

function DecoderStream (opts) {
  if (!(this instanceof DecoderStream)) return new DecoderStream(opts)
  if (!opts) opts = {}

  this.key = null
  this.discoveryKey = null
  this.remoteDiscoveryKey = null
  this._needsKey = false

  // Set during parsing
  this._data = null
  this._start = 0
  this._missing = 0
  this._buf = null
  this._pointer = 0
  this._cb = null
  this._firstFeed = true

  this.encrypted = opts.encrypt !== false
  this._xor = null
  this._nonce = null

  stream.Transform.call(this, { readableObjectMode: true })
}
inherits(DecoderStream, stream.Transform)

DecoderStream.prototype._transform = function (data, enc, cb) {
  this._parse(data, 0, cb)
}

DecoderStream.prototype._resume = function () {
  var self = this
  process.nextTick(resume)

  function resume () {
    if (!self._data) return

    var data = self._data
    var start = self._start
    var cb = self._cb

    self._data = null
    self._start = 0
    self._cb = null
    self._parse(data, start, cb)
  }
}

DecoderStream.prototype._parse = function (data, start, cb) {
  var decrypted = !!this._xor

  if (start) {
    data = data.slice(start)
    start = 0
  }

  if (this._xor) this._xor.update(data, data)

  while (start < data.length && !this.destroyed) {
    if (this._missing) start = this._parseMessage(data, start)
    else start = this._parseLength(data, start)

    if (this._needsKey) {
      this._data = data
      this._start = start
      this._cb = cb
      return
    }

    if (!decrypted && this._xor) {
      return this._parse(data, start, cb)
    }
  }

  cb()
}

Protocol.prototype._parseMessage = function (data, start) {
  var end = start + this._missing

  if (end <= data.length) {
    var ret = end

    if (this._buf) {
      data.copy(this._buf, this._pointer, start)
      data = this._buf
      start = 0
      end = data.length
      this._buf = null
    }

    this._missing = 0
    this._pointer = 0
    if (this.encrypted && !this.key) this._needsKey = true
    this._onmessage(data, start, end)

    return ret
  }

  if (!this._buf) {
    this._buf = new Buffer(this._missing)
    this._pointer = 0
  }

  var rem = data.length - start

  data.copy(this._buf, this._pointer, start)
  this._pointer += rem
  this._missing -= rem

  return data.length
}

Protocol.prototype._onmessage = function (data, start, end) {
  if (end - start < 2) return

  var header = decodeHeader(data, start)
  if (header === -1) return this.destroy(errors.invalidHeader())

  start += varint.decode.bytes

  var id = header >> 4
  var type = header & 15

  var message
  if (type === consts.Protocol.Extension) {
    message = decodeExtension(data, start, end)
  } else {
    message = decodeMessage(type, data, start, end)
  }

  if (this._firstFeed && (!message || type !== consts.Protocol.Feed)) {
    this.destroy(errors.badFeed())
  } else if (this._firstFeed && type === consts.Protocol.Feed) {
    this._setupConnection(message)
    this._firstFeed = false
  } else {
    this.push({
      type: type,
      id: id,
      value: message
    })
  }
}

DecoderStream.prototype._setupConnection = function (feed) {
  if (!this.remoteDiscoveryKey) {
    this.remoteDiscoveryKey = feed.discoveryKey
    if (!this._sameKey()) return

    if (this.encrypted && !this._nonce) {
      if (!feed.nonce) {
        this.destroy(errors.noNonce())
        return
      }
      this._nonce = feed.nonce
    }

    if (this.encrypted && this.key && !this._xor) {
      this._xor = sodium.crypto_stream_xor_instance(this._nonce, this.key)
    }
  }
  this.push({
    type: consts.Internal.ConnectionInfo,
    key: this.key,
    nonce: this._nonce,
    remoteDiscoveryKey: this.remoteDiscoveryKey
  })
}

DecoderStream.prototype._sameKey = function () {
  if (!this.discoveryKey || !this.remoteDiscoveryKey) return true
  if (this.remoteDiscoveryKey.toString('hex') === this.discoveryKey.toString('hex')) return true
  this.destroy(errors.differentFirstFeed())
  return false
}

function decodeHeader (data, start) {
  try {
    return varint.decode(data, start)
  } catch (err) {
    return -1
  }
}

function decodeFeed (data, start, end) {
  var feed = decodeMessage(consts.Protocol.Feed, data, start, end)
  if (!feed) return null

  if (feed.discoveryKey.length !== 32) return null
  if (feed.nonce && feed.nonce.length !== 24) return null

  return feed
}

function decodeMessage (type, data, start, end) {
  switch (type) {
    case consts.Protocol.Feed: return decode(protocol.Feed, data, start, end)
    case consts.Protocol.Handshake: return decode(protocol.Handshake, data, start, end)
    case consts.Protocol.Info: return decode(protocol.Info, data, start, end)
    case consts.Protocol.Have: return decode(protocol.Have, data, start, end)
    case consts.Protocol.Unhave: return decode(protocol.Unhave, data, start, end)
    case consts.Protocol.Want: return decode(protocol.Want, data, start, end)
    case consts.Protocol.Unwant: return decode(protocol.Unwant, data, start, end)
    case consts.Protocol.Request: return decode(protocol.Request, data, start, end)
    case consts.Protocol.Cancel: return decode(protocol.Cancel, data, start, end)
    case consts.Protocol.Data: return decode(protocol.Data, data, start, end)
    default: return null
  }
}

function decodeExtension (data, start, end) {
  if (end <= start) return

  var id = varint.decode(data, start)
  var message = data.slice(start + varint.decode.bytes, end)

  this.push({
    type: consts.Protocol.Extension,
    extensionId: id,
    value: message
  })
}

function decode (enc, data, start, end) {
  try {
    return enc.decode(data, start, end)
  } catch (err) {
    return null
  }
}
