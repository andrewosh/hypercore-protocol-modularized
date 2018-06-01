var stream = require('readable-stream')
var inherits = require('inherits')
var indexOf = require('sorted-indexof')
var sodium = require('sodium-universal')
var varint = require('varint')
var bufferAlloc = require('buffer-alloc-unsafe')
var bufferFrom = require('buffer-from')

var Feed = require('./feed')

var consts = require('../common/consts')
var errors = require('../common/errors')

module.exports = FeedStream

function FeedStream (opts) {
  if (!(this instanceof FeedStream)) return new FeedStream(opts)
  if (!opts) opts = {}

  this.id = opts.id || randomBytes(32)
  this.userData = opts.userData || null
  this.live = !!opts.live
  this.feeds = []

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
  // Do nothing, everything is pushed.
}

FeedStream.prototype._write = function (msg, enc, cb) {
  console.log('FEED STREAM MESSAGE:', msg)
  if (msg.type === consts.Protocol.Feed) {
    this._validateFeed(msg.value)
  }

  if (msg.id >= 128) return this.destroy(errors.tooManyFeeds())
  while (this._remoteFeeds.length < msg.id) this._remoteFeeds.push(null)

  var ch = this._remoteFeeds[msg.id]

  if (msg.type === consts.Protocol.Feed) {
    if (ch) ch._onclose()
    console.log('OPENING CHANNEL')
    return this._openChannel(msg.id, msg.value, cb)
  }

  if (!ch) {
    return this.destroy(errors.badFeed())
  }
  if (msg.type === consts.Protocol.Extension) return ch._onextension(msg)
  ch._onmessage(msg)
}

FeedStream.prototype._openChannel = function (id, feed, cb) {
  this._remoteFeeds[id] = this._createFeed(feed.discoveryKey)
  feed.remoteId = id
  this.emit('feed', feed.discoveryKey)
  return cb()
}

FeedStream.prototype._createFeed = function (dk) {
  var hex = dk.toString('hex')
  var ch = this._feeds[hex]
  if (ch) return ch
  ch = this._feeds[hex] = Feed(this)
  return ch
}

FeedStream.prototype.feed = function (key, opts) {
  if (this.destroyed) return null
  if (!opts) opts = {}

  var dk = opts.discoveryKey || discoveryKey(key)
  var ch = this._createFeed(dk)

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
      nonce: randomBytes(24)
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

FeedStream.prototype._validateFeed = function (feed) {
  if ((feed.discoveryKey.length !== 32) ||
      (feed.nonce && feed.nonce.length !== 24)) {
    this.destroy(errors.badFeed())
  }
}

function discoveryKey (key) {
  var buf = bufferAlloc(32)
  sodium.crypto_generichash(buf, bufferFrom('hypercore'), key)
  return buf
}

function randomBytes (n) {
  var buf = bufferAlloc(n)
  sodium.randombytes_buf(buf)
  return buf
}
