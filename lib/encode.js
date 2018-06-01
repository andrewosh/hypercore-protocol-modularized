var stream = require('readable-stream')
var inherits = require('inherits')
var sodium = require('sodium-universal')

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

  if (msg.type === consts.Internal.ConnectionInfo) {
    this.key = msg.key
  } else if (this._encrypt && this._firstFeed && msg.type === consts.Protocol.Feed) {
    this._xor = sodium.crypto_stream_xor_instance(msg.value.nonce, this.key)
    this._firstFeed = false
  }

  var box
  if (msg.type === consts.Protocol.Extension) {
    box = encodeExtension(msg)
  } else {
    box = encodeMessage(msg)
  }

  if (this._xor) this._xor.update(box, box)
  this.push(box)
  cb()
}

function encodeMessage (msg) {
  var encoding = encodings.get(msg.type)
  if (!encoding) return msg.value

  var header = (msg.id << 4) | msg.type
  var len = varint.encodingLength(header) + encoding.encodingLength(msg.value)

  var box = new Buffer(varint.encodingLength(len) + len)
  var offset = 0

  varint.encode(len, box, offset)
  offset += varint.encode.bytes

  varint.encode(header, box, offset)
  offset += varint.encode.bytes
}

function encodeExtension (msg) {
  var header = this.header | 15
  var len = this.headerLength + varint.encodingLength(msg.extensionId) + msg.value.length
  var box = new Buffer(varint.encodingLength(len) + len)
  var offset = 0

  varint.encode(len, box, offset)
  offset += varint.encode.bytes

  varint.encode(header, box, offset)
  offset += varint.encode.bytes

  varint.encode(id, box, offset)
  offset += varint.encode.bytes

  message.copy(box, offset)
  return this.stream._push(box)
}

inherits(EncoderStream, stream.Transform)

