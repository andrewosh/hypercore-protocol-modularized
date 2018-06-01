var stream = require('readable-stream')
var inherits = require('inherits')
var sodium = require('sodium-universal')
var varint = require('varint')
var bufferAlloc = require('buffer-alloc-unsafe')

var consts = require('./common/consts')
var encodings = require('./common/encodings')

module.exports = EncoderStream

function EncoderStream (opts) {
  if (!(this instanceof EncoderStream)) return new EncoderStream(opts)
  if (!opts) opts = {}

  this._encrypt = opts.encrypt !== false

  // Set during stream processing
  this.key = null
  this._xor = null

  this._firstFeed = true

  stream.Transform.call(this, { writableObjectMode: true })
}
inherits(EncoderStream, stream.Transform)

EncoderStream.prototype._transform = function (msg, enc, cb) {
  if (this.destroyed) return
  console.log('ENCODER INPUT:', msg)

  var box
  if (msg.type === consts.Protocol.Extension) {
    box = encodeExtension(msg)
  } else {
    box = encodeMessage(msg)
  }

  console.log('this._xor:', this._xor)
  if (this._xor) this._xor.update(box, box)

  // Generate the xor after the first feed message is sent.
  if (this._encrypt && this._firstFeed && msg.type === consts.Protocol.Feed) {
    this._xor = sodium.crypto_stream_xor_instance(msg.value.nonce, this.key)
    this._firstFeed = false
  }

  console.log('ENCODER PUSHING:', box)
  this.push(box)
  cb()
}

EncoderStream.prototype.setKey = function (key) {
  this.key = key
}

function encodeMessage (msg) {
  var enc = encodings[msg.type]
  if (!enc) return msg.value

  var header = (msg.id << 4) | msg.type
  var len = varint.encodingLength(header) + enc.encodingLength(msg.value)

  var box = bufferAlloc(varint.encodingLength(len) + len)
  var offset = 0

  varint.encode(len, box, offset)
  offset += varint.encode.bytes

  varint.encode(header, box, offset)
  offset += varint.encode.bytes

  enc.encode(msg.value, box, offset)

  return box
}

function encodeExtension (msg) {
  var header = this.header | 15
  var len = this.headerLength + varint.encodingLength(msg.extensionId) + msg.value.length
  var box = bufferAlloc(varint.encodingLength(len) + len)
  var offset = 0

  varint.encode(len, box, offset)
  offset += varint.encode.bytes

  varint.encode(header, box, offset)
  offset += varint.encode.bytes

  varint.encode(msg.extensionId, box, offset)
  offset += varint.encode.bytes

  msg.copy(box, offset)

  return box
}

inherits(EncoderStream, stream.Transform)
