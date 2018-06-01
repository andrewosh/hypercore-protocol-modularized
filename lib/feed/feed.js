var events = require('events')
var inherits = require('inherits')
var varint = require('varint')
var messages = require('./messages')

module.exports = Feed

function Feed (stream) {
  if (!(this instanceof Feed)) return new Feed(stream)
  events.EventEmitter.call(this)

  this.key = null
  this.discoveryKey = null
  this.stream = stream
  this.peer = null // support a peer object to avoid event emitter + closures overhead

  this.id = -1
  this.remoteId = -1
  this.closed = false

  this._buffer = []
}

inherits(Feed, events.EventEmitter)

Feed.prototype.handshake = function (message) {
  return this._send(consts.Protocol.Handshake, message)
}

Feed.prototype.info = function (message) {
  return this._send(consts.Protocol.Info, message)
}

Feed.prototype.have = function (message) {
  return this._send(consts.Protocol.Have, message)
}

Feed.prototype.unhave = function (message) {
  return this._send(consts.Protocol.Unhave, message)
}

Feed.prototype.want = function (message) {
  return this._send(consts.Protocol.Want, message)
}

Feed.prototype.unwant = function (message) {
  return this._send(consts.Protocol.Unwant, message)
}

Feed.prototype.request = function (message) {
  return this._send(consts.Protocol.Request, message)
}

Feed.prototype.cancel = function (message) {
  return this._send(consts.Protocol.Cancel, message)
}

Feed.prototype.data = function (message) {
  return this._send(consts.Protocol.Data, message)
}

Feed.prototype.extension = function (type, message) {
  var id = this.stream.extensions.indexOf(type)
  if (id === -1) return false

  return this.push({
    type: consts.Protocol.Extension,
    id: id,
    value: message
  })
}

Feed.prototype.remoteSupports = function (name) {
  return this.stream.remoteSupports(name)
}

Feed.prototype.destroy = function (err) {
  this.stream.destroy(err)
}

Feed.prototype.close = function () {
  var i = this.stream.feeds.indexOf(this)

  if (i > -1) {
    this.stream.feeds[i] = this.stream.feeds[this.stream.feeds.length - 1]
    this.stream.feeds.pop()
    this.stream._localFeeds[this.id] = null
    this.id = -1

    if (this.stream.destroyed) return
    if (this.stream.expectedFeeds <= 0 || --this.stream.expectedFeeds) return

    this.stream.finalize()
  }
}

Feed.prototype._onclose = function () {
  if (this.closed) return
  this.closed = true

  if (!this.stream.destroyed) {
    this.close()
    if (this.remoteId > -1) this.stream._remoteFeeds[this.remoteId] = null
    var hex = this.discoveryKey.toString('hex')
    if (this._feeds[hex] === this) delete this._feeds[hex]
  }

  if (this.peer) this.peer.onclose()
  else this.emit('close')
}

Feed.prototype._resume = function () {
  var self = this
  process.nextTick(resume)

  function resume () {
    while (self._buffer.length) {
      var next = self._buffer.shift()
      self._emit(next.type, next.message)
    }
    self._buffer = null
  }
}

Feed.prototype._onextension = function (message) {
  var id = message.extensionId
  if (id === -1) return

  var r = this.stream.remoteExtensions
  var localId = !r || id >= r.length ? -1 : r[id]
  if (localId === -1) return

  var name = this.stream.extensions[localId]

  if (this.peer && this.peer.onextension) this.peer.onextension(name, message.value)
  else this.emit('extension', name, message.value)
}

Feed.prototype._onmessage = function (message) {
  if (!message || this.closed) return
  if (type === consts.Protocol.Handshake) return this.stream._onhandshake(message)

  if (!this._buffer) {
    this._emit(type, message)
    return
  }

  if (this._buffer.length > 16) {
    this.destroy(errors.tooManyMessages())
    return
  }

  this._buffer.push({type: type, message: message})
}

Feed.prototype._emit = function (type, message) {
  if (this.peer) {
    switch (type) {
      case consts.Protocol.Info: return this.peer.oninfo(message)
      case consts.Protocol.Have: return this.peer.onhave(message)
      case consts.Protocol.Unhave: return this.peer.onunhave(message)
      case consts.Protocol.Want: return this.peer.onwant(message)
      case consts.Protocol.Unwant: return this.peer.onunwant(message)
      case consts.Protocol.Request: return this.peer.onrequest(message)
      case consts.Protocol.Cancel: return this.peer.oncancel(message)
      case consts.Protocol.Data: return this.peer.ondata(message)
    }
  } else {
    switch (type) {
      case consts.Protocol.Info: return this.emit('info', message)
      case consts.Protocol.Have: return this.emit('have', message)
      case consts.Protocol.Unhave: return this.emit('unhave', message)
      case consts.Protocol.Want: return this.emit('want', message)
      case consts.Protocol.Unwant: return this.emit('unwant', message)
      case consts.Protocol.Request: return this.emit('request', message)
      case consts.Protocol.Cancel: return this.emit('cancel', message)
      case consts.Protocol.Data: return this.emit('data', message)
    }
  }
}

Feed.prototype._send = function (type, message) {
  return this._stream.push({
    id: this.id,
    type: type,
    value: message
  })
}

function decodeMessage (type, data, start, end) {
  switch (type) {
    case 1: return decode(messages.Handshake, data, start, end)
    case 2: return decode(messages.Info, data, start, end)
    case 3: return decode(messages.Have, data, start, end)
    case 4: return decode(messages.Unhave, data, start, end)
    case 5: return decode(messages.Want, data, start, end)
    case 6: return decode(messages.Unwant, data, start, end)
    case 7: return decode(messages.Request, data, start, end)
    case 8: return decode(messages.Cancel, data, start, end)
    case 9: return decode(messages.Data, data, start, end)
  }
}

function decode (enc, data, start, end) {
  try {
    return enc.decode(data, start, end)
  } catch (err) {
    return null
  }
}
