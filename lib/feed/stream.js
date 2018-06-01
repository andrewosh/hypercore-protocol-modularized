var stream = require('readable-stream')
var inherits = require('inherits')

var Feed = require('./feed')

module.exports = FeedStream

function FeedStream (opts) {
  if (!(this instanceof FeedStream)) return new FeedStream(opts)
  if (!opts) opts = {}

  this._localFeeds = []
  this._remoteFeeds = []
  this._feeds = {}

  this.extensions = opts.extensions || []
  this.remoteExtensions = null

  this._firstFeed = true

  stream.Duplex.call(this, { writableObjectMode: true, readableObjectMode: true })
}
inherits(FeedStream, stream.Duplex)

FeedStream.prototype._read = function () {

}

FeedStream.prototype._write = function (msg, enc, cb) {
  if (msg.id >= 128) return this._tooManyFeeds()
  while (this._remoteFeeds.length < msg.id) this._remoteFeeds.push(null)

  var ch = this._remoteFeeds[id]

  if (type === 0) {
    if (ch) ch._onclose()
    return this._openChannel(id, msg)
  }

  if (!ch) {
    return this.destroy(errors.badFeed())
  }
  if (type === 15) return ch._onextension(msg)
  ch._onmessage(msg)
}

FeedStream.prototype._createFeed = function (key) {
  var hex = dk.toString('hex')
  var ch = this._feeds[hex]
  if (ch) return ch
  ch = this._feeds[hex] = feed(this)
  return ch

}

FeedStream.prototype.feed = function (key, opts) {
  if (this.destroyed) return null
  if (!opts) opts = {}

  var dk = opts.discoveryKey || discoveryKey(key)
  var ch = this._feed(dk)

  if (ch.id > -1) {
    if (opts.peer) ch.peer = opts.peer
    return ch
  }

  if (this._localFeeds.length >= 128) {
    this.destroy(errors.tooManyFeeds())
    return null
  }

  ch.id = this._localFeeds.push(ch) - 1
  ch.header = ch.id << 4
  ch.headerLength = varint.encodingLength(ch.header)
  ch.key = key
  ch.discoveryKey = dk
  if (opts.peer) ch.peer = opts.peer

  this.feeds.push(ch)

  var feed = {
    type: consts.Protocol.Feed,
    id: ch.id,
    value: {
      discoveryKey: dk,
      nonce: null
    }
  }

  this.push(feed)

  if (this.destroyed) return null

  if (this._firstFeed) {
    ch.handshake({
      id: this.id,
      live: this.live,
      userData: this.userData,
      extensions: this.extensions
    })
  }

  if (ch._buffer.length) ch._resume()
  else ch._buffer = null

  return ch
}

FeedStream.prototype._onhandshake = function (handshake) {
  if (this.remoteId) return

  this.remoteId = handshake.id || randomBytes(32)
  this.remoteLive = handshake.live
  this.remoteUserData = handshake.userData
  this.remoteExtensions = indexOf(this.extensions, handshake.extensions)

  this.emit('handshake')
}
