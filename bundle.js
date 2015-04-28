(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Note:
 *
 * - Implementation must support adding new properties to `Uint8Array` instances.
 *   Firefox 4-29 lacked support, fixed in Firefox 30+.
 *   See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *  - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *  - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *    incorrect length in some situations.
 *
 * We detect these buggy browsers and set `TYPED_ARRAY_SUPPORT` to `false` so they will
 * get the Object implementation, which is slower but will work correctly.
 */
var TYPED_ARRAY_SUPPORT = (function () {
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() && // typed array instances can be augmented
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        new Uint8Array(1).subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Find the length
  var length
  if (type === 'number')
    length = subject > 0 ? subject >>> 0 : 0
  else if (type === 'string') {
    if (encoding === 'base64')
      subject = base64clean(subject)
    length = Buffer.byteLength(subject, encoding)
  } else if (type === 'object' && subject !== null) { // assume object is array-like
    if (subject.type === 'Buffer' && isArray(subject.data))
      subject = subject.data
    length = +subject.length > 0 ? Math.floor(+subject.length) : 0
  } else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (TYPED_ARRAY_SUPPORT) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (TYPED_ARRAY_SUPPORT && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    if (Buffer.isBuffer(subject)) {
      for (i = 0; i < length; i++)
        buf[i] = subject.readUInt8(i)
    } else {
      for (i = 0; i < length; i++)
        buf[i] = ((subject[i] % 256) + 256) % 256
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !TYPED_ARRAY_SUPPORT && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str.toString()
  switch (encoding || 'utf8') {
    case 'hex':
      ret = str.length / 2
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.concat = function (list, totalLength) {
  assert(isArray(list), 'Usage: Buffer.concat(list[, length])')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (totalLength === undefined) {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

Buffer.compare = function (a, b) {
  assert(Buffer.isBuffer(a) && Buffer.isBuffer(b), 'Arguments must be Buffers')
  var x = a.length
  var y = b.length
  for (var i = 0, len = Math.min(x, y); i < len && a[i] === b[i]; i++) {}
  if (i !== len) {
    x = a[i]
    y = b[i]
  }
  if (x < y) {
    return -1
  }
  if (y < x) {
    return 1
  }
  return 0
}

// BUFFER INSTANCE METHODS
// =======================

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  assert(strLen % 2 === 0, 'Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    assert(!isNaN(byte), 'Invalid hex string')
    buf[offset + i] = byte
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function asciiWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function utf16leWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf16leToBytes(string), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = utf16leWrite(this, string, offset, length)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end === undefined) ? self.length : Number(end)

  // Fastpath empty strings
  if (end === start)
    return ''

  var ret
  switch (encoding) {
    case 'hex':
      ret = hexSlice(self, start, end)
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8Slice(self, start, end)
      break
    case 'ascii':
      ret = asciiSlice(self, start, end)
      break
    case 'binary':
      ret = binarySlice(self, start, end)
      break
    case 'base64':
      ret = base64Slice(self, start, end)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = utf16leSlice(self, start, end)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

Buffer.prototype.equals = function (b) {
  assert(Buffer.isBuffer(b), 'Argument must be a Buffer')
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.compare = function (b) {
  assert(Buffer.isBuffer(b), 'Argument must be a Buffer')
  return Buffer.compare(this, b)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  assert(end >= start, 'sourceEnd < sourceStart')
  assert(target_start >= 0 && target_start < target.length,
      'targetStart out of bounds')
  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 100 || !TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < len; i++) {
      target[i + target_start] = this[i + start]
    }
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function binarySlice (buf, start, end) {
  return asciiSlice(buf, start, end)
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len;
    if (start < 0)
      start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0)
      end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start)
    end = start

  if (TYPED_ARRAY_SUPPORT) {
    return Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  return this[offset]
}

function readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    val = buf[offset]
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
  } else {
    val = buf[offset] << 8
    if (offset + 1 < len)
      val |= buf[offset + 1]
  }
  return val
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return readUInt16(this, offset, false, noAssert)
}

function readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    if (offset + 2 < len)
      val = buf[offset + 2] << 16
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
    val |= buf[offset]
    if (offset + 3 < len)
      val = val + (buf[offset + 3] << 24 >>> 0)
  } else {
    if (offset + 1 < len)
      val = buf[offset + 1] << 16
    if (offset + 2 < len)
      val |= buf[offset + 2] << 8
    if (offset + 3 < len)
      val |= buf[offset + 3]
    val = val + (buf[offset] << 24 >>> 0)
  }
  return val
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  var neg = this[offset] & 0x80
  if (neg)
    return (0xff - this[offset] + 1) * -1
  else
    return this[offset]
}

function readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = readUInt16(buf, offset, littleEndian, true)
  var neg = val & 0x8000
  if (neg)
    return (0xffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return readInt16(this, offset, false, noAssert)
}

function readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = readUInt32(buf, offset, littleEndian, true)
  var neg = val & 0x80000000
  if (neg)
    return (0xffffffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return readInt32(this, offset, false, noAssert)
}

function readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 23, 4)
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return readFloat(this, offset, false, noAssert)
}

function readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 52, 8)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= this.length) return

  this[offset] = value
  return offset + 1
}

function writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
    buf[offset + i] =
        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
            (littleEndian ? i : 1 - i) * 8
  }
  return offset + 2
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  return writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  return writeUInt16(this, value, offset, false, noAssert)
}

function writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
    buf[offset + i] =
        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
  return offset + 4
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  return writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  return writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= this.length)
    return

  if (value >= 0)
    this.writeUInt8(value, offset, noAssert)
  else
    this.writeUInt8(0xff + value + 1, offset, noAssert)
  return offset + 1
}

function writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    writeUInt16(buf, value, offset, littleEndian, noAssert)
  else
    writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
  return offset + 2
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  return writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  return writeInt16(this, value, offset, false, noAssert)
}

function writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    writeUInt32(buf, value, offset, littleEndian, noAssert)
  else
    writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
  return offset + 4
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  return writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  return writeInt32(this, value, offset, false, noAssert)
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  assert(end >= start, 'end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  assert(start >= 0 && start < this.length, 'start out of bounds')
  assert(end >= 0 && end <= this.length, 'end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (TYPED_ARRAY_SUPPORT) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1) {
        buf[i] = this[i]
      }
      return buf.buffer
    }
  } else {
    throw new Error('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.equals = BP.equals
  arr.compare = BP.compare
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

var INVALID_BASE64_RE = /[^+\/0-9A-z]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F) {
      byteArray.push(b)
    } else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++) {
        byteArray.push(parseInt(h[j], 16))
      }
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value >= 0, 'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754 (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

},{"base64-js":3,"ieee754":4}],3:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS)
			return 62 // '+'
		if (code === SLASH)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],4:[function(require,module,exports){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],5:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      } else {
        throw TypeError('Uncaught, unspecified "error" event.');
      }
      return false;
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],6:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],7:[function(require,module,exports){
module.exports = Array.isArray || function (arr) {
  return Object.prototype.toString.call(arr) == '[object Array]';
};

},{}],8:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,require('_process'))
},{"_process":9}],9:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],10:[function(require,module,exports){
module.exports = require("./lib/_stream_duplex.js")

},{"./lib/_stream_duplex.js":11}],11:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a duplex stream is just a stream that is both readable and writable.
// Since JS doesn't have multiple prototypal inheritance, this class
// prototypally inherits from Readable, and then parasitically from
// Writable.

module.exports = Duplex;

/*<replacement>*/
var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) keys.push(key);
  return keys;
}
/*</replacement>*/


/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

var Readable = require('./_stream_readable');
var Writable = require('./_stream_writable');

util.inherits(Duplex, Readable);

forEach(objectKeys(Writable.prototype), function(method) {
  if (!Duplex.prototype[method])
    Duplex.prototype[method] = Writable.prototype[method];
});

function Duplex(options) {
  if (!(this instanceof Duplex))
    return new Duplex(options);

  Readable.call(this, options);
  Writable.call(this, options);

  if (options && options.readable === false)
    this.readable = false;

  if (options && options.writable === false)
    this.writable = false;

  this.allowHalfOpen = true;
  if (options && options.allowHalfOpen === false)
    this.allowHalfOpen = false;

  this.once('end', onend);
}

// the no-half-open enforcer
function onend() {
  // if we allow half-open state, or if the writable side ended,
  // then we're ok.
  if (this.allowHalfOpen || this._writableState.ended)
    return;

  // no more data can be written.
  // But allow more writes to happen in this tick.
  process.nextTick(this.end.bind(this));
}

function forEach (xs, f) {
  for (var i = 0, l = xs.length; i < l; i++) {
    f(xs[i], i);
  }
}

}).call(this,require('_process'))
},{"./_stream_readable":13,"./_stream_writable":15,"_process":9,"core-util-is":16,"inherits":6}],12:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// a passthrough stream.
// basically just the most minimal sort of Transform stream.
// Every written chunk gets output as-is.

module.exports = PassThrough;

var Transform = require('./_stream_transform');

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

util.inherits(PassThrough, Transform);

function PassThrough(options) {
  if (!(this instanceof PassThrough))
    return new PassThrough(options);

  Transform.call(this, options);
}

PassThrough.prototype._transform = function(chunk, encoding, cb) {
  cb(null, chunk);
};

},{"./_stream_transform":14,"core-util-is":16,"inherits":6}],13:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Readable;

/*<replacement>*/
var isArray = require('isarray');
/*</replacement>*/


/*<replacement>*/
var Buffer = require('buffer').Buffer;
/*</replacement>*/

Readable.ReadableState = ReadableState;

var EE = require('events').EventEmitter;

/*<replacement>*/
if (!EE.listenerCount) EE.listenerCount = function(emitter, type) {
  return emitter.listeners(type).length;
};
/*</replacement>*/

var Stream = require('stream');

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

var StringDecoder;

util.inherits(Readable, Stream);

function ReadableState(options, stream) {
  options = options || {};

  // the point at which it stops calling _read() to fill the buffer
  // Note: 0 is a valid value, means "don't call _read preemptively ever"
  var hwm = options.highWaterMark;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : 16 * 1024;

  // cast to ints.
  this.highWaterMark = ~~this.highWaterMark;

  this.buffer = [];
  this.length = 0;
  this.pipes = null;
  this.pipesCount = 0;
  this.flowing = false;
  this.ended = false;
  this.endEmitted = false;
  this.reading = false;

  // In streams that never have any data, and do push(null) right away,
  // the consumer can miss the 'end' event if they do some I/O before
  // consuming the stream.  So, we don't emit('end') until some reading
  // happens.
  this.calledRead = false;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, becuase any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // whenever we return null, then we set a flag to say
  // that we're awaiting a 'readable' event emission.
  this.needReadable = false;
  this.emittedReadable = false;
  this.readableListening = false;


  // object stream flag. Used to make read(n) ignore n and to
  // make all the buffer merging and length checks go away
  this.objectMode = !!options.objectMode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // when piping, we only care about 'readable' events that happen
  // after read()ing all the bytes and not getting any pushback.
  this.ranOut = false;

  // the number of writers that are awaiting a drain event in .pipe()s
  this.awaitDrain = 0;

  // if true, a maybeReadMore has been scheduled
  this.readingMore = false;

  this.decoder = null;
  this.encoding = null;
  if (options.encoding) {
    if (!StringDecoder)
      StringDecoder = require('string_decoder/').StringDecoder;
    this.decoder = new StringDecoder(options.encoding);
    this.encoding = options.encoding;
  }
}

function Readable(options) {
  if (!(this instanceof Readable))
    return new Readable(options);

  this._readableState = new ReadableState(options, this);

  // legacy
  this.readable = true;

  Stream.call(this);
}

// Manually shove something into the read() buffer.
// This returns true if the highWaterMark has not been hit yet,
// similar to how Writable.write() returns true if you should
// write() some more.
Readable.prototype.push = function(chunk, encoding) {
  var state = this._readableState;

  if (typeof chunk === 'string' && !state.objectMode) {
    encoding = encoding || state.defaultEncoding;
    if (encoding !== state.encoding) {
      chunk = new Buffer(chunk, encoding);
      encoding = '';
    }
  }

  return readableAddChunk(this, state, chunk, encoding, false);
};

// Unshift should *always* be something directly out of read()
Readable.prototype.unshift = function(chunk) {
  var state = this._readableState;
  return readableAddChunk(this, state, chunk, '', true);
};

function readableAddChunk(stream, state, chunk, encoding, addToFront) {
  var er = chunkInvalid(state, chunk);
  if (er) {
    stream.emit('error', er);
  } else if (chunk === null || chunk === undefined) {
    state.reading = false;
    if (!state.ended)
      onEofChunk(stream, state);
  } else if (state.objectMode || chunk && chunk.length > 0) {
    if (state.ended && !addToFront) {
      var e = new Error('stream.push() after EOF');
      stream.emit('error', e);
    } else if (state.endEmitted && addToFront) {
      var e = new Error('stream.unshift() after end event');
      stream.emit('error', e);
    } else {
      if (state.decoder && !addToFront && !encoding)
        chunk = state.decoder.write(chunk);

      // update the buffer info.
      state.length += state.objectMode ? 1 : chunk.length;
      if (addToFront) {
        state.buffer.unshift(chunk);
      } else {
        state.reading = false;
        state.buffer.push(chunk);
      }

      if (state.needReadable)
        emitReadable(stream);

      maybeReadMore(stream, state);
    }
  } else if (!addToFront) {
    state.reading = false;
  }

  return needMoreData(state);
}



// if it's past the high water mark, we can push in some more.
// Also, if we have no data yet, we can stand some
// more bytes.  This is to work around cases where hwm=0,
// such as the repl.  Also, if the push() triggered a
// readable event, and the user called read(largeNumber) such that
// needReadable was set, then we ought to push more, so that another
// 'readable' event will be triggered.
function needMoreData(state) {
  return !state.ended &&
         (state.needReadable ||
          state.length < state.highWaterMark ||
          state.length === 0);
}

// backwards compatibility.
Readable.prototype.setEncoding = function(enc) {
  if (!StringDecoder)
    StringDecoder = require('string_decoder/').StringDecoder;
  this._readableState.decoder = new StringDecoder(enc);
  this._readableState.encoding = enc;
};

// Don't raise the hwm > 128MB
var MAX_HWM = 0x800000;
function roundUpToNextPowerOf2(n) {
  if (n >= MAX_HWM) {
    n = MAX_HWM;
  } else {
    // Get the next highest power of 2
    n--;
    for (var p = 1; p < 32; p <<= 1) n |= n >> p;
    n++;
  }
  return n;
}

function howMuchToRead(n, state) {
  if (state.length === 0 && state.ended)
    return 0;

  if (state.objectMode)
    return n === 0 ? 0 : 1;

  if (isNaN(n) || n === null) {
    // only flow one buffer at a time
    if (state.flowing && state.buffer.length)
      return state.buffer[0].length;
    else
      return state.length;
  }

  if (n <= 0)
    return 0;

  // If we're asking for more than the target buffer level,
  // then raise the water mark.  Bump up to the next highest
  // power of 2, to prevent increasing it excessively in tiny
  // amounts.
  if (n > state.highWaterMark)
    state.highWaterMark = roundUpToNextPowerOf2(n);

  // don't have that much.  return null, unless we've ended.
  if (n > state.length) {
    if (!state.ended) {
      state.needReadable = true;
      return 0;
    } else
      return state.length;
  }

  return n;
}

// you can override either this method, or the async _read(n) below.
Readable.prototype.read = function(n) {
  var state = this._readableState;
  state.calledRead = true;
  var nOrig = n;

  if (typeof n !== 'number' || n > 0)
    state.emittedReadable = false;

  // if we're doing read(0) to trigger a readable event, but we
  // already have a bunch of data in the buffer, then just trigger
  // the 'readable' event and move on.
  if (n === 0 &&
      state.needReadable &&
      (state.length >= state.highWaterMark || state.ended)) {
    emitReadable(this);
    return null;
  }

  n = howMuchToRead(n, state);

  // if we've ended, and we're now clear, then finish it up.
  if (n === 0 && state.ended) {
    if (state.length === 0)
      endReadable(this);
    return null;
  }

  // All the actual chunk generation logic needs to be
  // *below* the call to _read.  The reason is that in certain
  // synthetic stream cases, such as passthrough streams, _read
  // may be a completely synchronous operation which may change
  // the state of the read buffer, providing enough data when
  // before there was *not* enough.
  //
  // So, the steps are:
  // 1. Figure out what the state of things will be after we do
  // a read from the buffer.
  //
  // 2. If that resulting state will trigger a _read, then call _read.
  // Note that this may be asynchronous, or synchronous.  Yes, it is
  // deeply ugly to write APIs this way, but that still doesn't mean
  // that the Readable class should behave improperly, as streams are
  // designed to be sync/async agnostic.
  // Take note if the _read call is sync or async (ie, if the read call
  // has returned yet), so that we know whether or not it's safe to emit
  // 'readable' etc.
  //
  // 3. Actually pull the requested chunks out of the buffer and return.

  // if we need a readable event, then we need to do some reading.
  var doRead = state.needReadable;

  // if we currently have less than the highWaterMark, then also read some
  if (state.length - n <= state.highWaterMark)
    doRead = true;

  // however, if we've ended, then there's no point, and if we're already
  // reading, then it's unnecessary.
  if (state.ended || state.reading)
    doRead = false;

  if (doRead) {
    state.reading = true;
    state.sync = true;
    // if the length is currently zero, then we *need* a readable event.
    if (state.length === 0)
      state.needReadable = true;
    // call internal read method
    this._read(state.highWaterMark);
    state.sync = false;
  }

  // If _read called its callback synchronously, then `reading`
  // will be false, and we need to re-evaluate how much data we
  // can return to the user.
  if (doRead && !state.reading)
    n = howMuchToRead(nOrig, state);

  var ret;
  if (n > 0)
    ret = fromList(n, state);
  else
    ret = null;

  if (ret === null) {
    state.needReadable = true;
    n = 0;
  }

  state.length -= n;

  // If we have nothing in the buffer, then we want to know
  // as soon as we *do* get something into the buffer.
  if (state.length === 0 && !state.ended)
    state.needReadable = true;

  // If we happened to read() exactly the remaining amount in the
  // buffer, and the EOF has been seen at this point, then make sure
  // that we emit 'end' on the very next tick.
  if (state.ended && !state.endEmitted && state.length === 0)
    endReadable(this);

  return ret;
};

function chunkInvalid(state, chunk) {
  var er = null;
  if (!Buffer.isBuffer(chunk) &&
      'string' !== typeof chunk &&
      chunk !== null &&
      chunk !== undefined &&
      !state.objectMode &&
      !er) {
    er = new TypeError('Invalid non-string/buffer chunk');
  }
  return er;
}


function onEofChunk(stream, state) {
  if (state.decoder && !state.ended) {
    var chunk = state.decoder.end();
    if (chunk && chunk.length) {
      state.buffer.push(chunk);
      state.length += state.objectMode ? 1 : chunk.length;
    }
  }
  state.ended = true;

  // if we've ended and we have some data left, then emit
  // 'readable' now to make sure it gets picked up.
  if (state.length > 0)
    emitReadable(stream);
  else
    endReadable(stream);
}

// Don't emit readable right away in sync mode, because this can trigger
// another read() call => stack overflow.  This way, it might trigger
// a nextTick recursion warning, but that's not so bad.
function emitReadable(stream) {
  var state = stream._readableState;
  state.needReadable = false;
  if (state.emittedReadable)
    return;

  state.emittedReadable = true;
  if (state.sync)
    process.nextTick(function() {
      emitReadable_(stream);
    });
  else
    emitReadable_(stream);
}

function emitReadable_(stream) {
  stream.emit('readable');
}


// at this point, the user has presumably seen the 'readable' event,
// and called read() to consume some data.  that may have triggered
// in turn another _read(n) call, in which case reading = true if
// it's in progress.
// However, if we're not ended, or reading, and the length < hwm,
// then go ahead and try to read some more preemptively.
function maybeReadMore(stream, state) {
  if (!state.readingMore) {
    state.readingMore = true;
    process.nextTick(function() {
      maybeReadMore_(stream, state);
    });
  }
}

function maybeReadMore_(stream, state) {
  var len = state.length;
  while (!state.reading && !state.flowing && !state.ended &&
         state.length < state.highWaterMark) {
    stream.read(0);
    if (len === state.length)
      // didn't get any data, stop spinning.
      break;
    else
      len = state.length;
  }
  state.readingMore = false;
}

// abstract method.  to be overridden in specific implementation classes.
// call cb(er, data) where data is <= n in length.
// for virtual (non-string, non-buffer) streams, "length" is somewhat
// arbitrary, and perhaps not very meaningful.
Readable.prototype._read = function(n) {
  this.emit('error', new Error('not implemented'));
};

Readable.prototype.pipe = function(dest, pipeOpts) {
  var src = this;
  var state = this._readableState;

  switch (state.pipesCount) {
    case 0:
      state.pipes = dest;
      break;
    case 1:
      state.pipes = [state.pipes, dest];
      break;
    default:
      state.pipes.push(dest);
      break;
  }
  state.pipesCount += 1;

  var doEnd = (!pipeOpts || pipeOpts.end !== false) &&
              dest !== process.stdout &&
              dest !== process.stderr;

  var endFn = doEnd ? onend : cleanup;
  if (state.endEmitted)
    process.nextTick(endFn);
  else
    src.once('end', endFn);

  dest.on('unpipe', onunpipe);
  function onunpipe(readable) {
    if (readable !== src) return;
    cleanup();
  }

  function onend() {
    dest.end();
  }

  // when the dest drains, it reduces the awaitDrain counter
  // on the source.  This would be more elegant with a .once()
  // handler in flow(), but adding and removing repeatedly is
  // too slow.
  var ondrain = pipeOnDrain(src);
  dest.on('drain', ondrain);

  function cleanup() {
    // cleanup event handlers once the pipe is broken
    dest.removeListener('close', onclose);
    dest.removeListener('finish', onfinish);
    dest.removeListener('drain', ondrain);
    dest.removeListener('error', onerror);
    dest.removeListener('unpipe', onunpipe);
    src.removeListener('end', onend);
    src.removeListener('end', cleanup);

    // if the reader is waiting for a drain event from this
    // specific writer, then it would cause it to never start
    // flowing again.
    // So, if this is awaiting a drain, then we just call it now.
    // If we don't know, then assume that we are waiting for one.
    if (!dest._writableState || dest._writableState.needDrain)
      ondrain();
  }

  // if the dest has an error, then stop piping into it.
  // however, don't suppress the throwing behavior for this.
  function onerror(er) {
    unpipe();
    dest.removeListener('error', onerror);
    if (EE.listenerCount(dest, 'error') === 0)
      dest.emit('error', er);
  }
  // This is a brutally ugly hack to make sure that our error handler
  // is attached before any userland ones.  NEVER DO THIS.
  if (!dest._events || !dest._events.error)
    dest.on('error', onerror);
  else if (isArray(dest._events.error))
    dest._events.error.unshift(onerror);
  else
    dest._events.error = [onerror, dest._events.error];



  // Both close and finish should trigger unpipe, but only once.
  function onclose() {
    dest.removeListener('finish', onfinish);
    unpipe();
  }
  dest.once('close', onclose);
  function onfinish() {
    dest.removeListener('close', onclose);
    unpipe();
  }
  dest.once('finish', onfinish);

  function unpipe() {
    src.unpipe(dest);
  }

  // tell the dest that it's being piped to
  dest.emit('pipe', src);

  // start the flow if it hasn't been started already.
  if (!state.flowing) {
    // the handler that waits for readable events after all
    // the data gets sucked out in flow.
    // This would be easier to follow with a .once() handler
    // in flow(), but that is too slow.
    this.on('readable', pipeOnReadable);

    state.flowing = true;
    process.nextTick(function() {
      flow(src);
    });
  }

  return dest;
};

function pipeOnDrain(src) {
  return function() {
    var dest = this;
    var state = src._readableState;
    state.awaitDrain--;
    if (state.awaitDrain === 0)
      flow(src);
  };
}

function flow(src) {
  var state = src._readableState;
  var chunk;
  state.awaitDrain = 0;

  function write(dest, i, list) {
    var written = dest.write(chunk);
    if (false === written) {
      state.awaitDrain++;
    }
  }

  while (state.pipesCount && null !== (chunk = src.read())) {

    if (state.pipesCount === 1)
      write(state.pipes, 0, null);
    else
      forEach(state.pipes, write);

    src.emit('data', chunk);

    // if anyone needs a drain, then we have to wait for that.
    if (state.awaitDrain > 0)
      return;
  }

  // if every destination was unpiped, either before entering this
  // function, or in the while loop, then stop flowing.
  //
  // NB: This is a pretty rare edge case.
  if (state.pipesCount === 0) {
    state.flowing = false;

    // if there were data event listeners added, then switch to old mode.
    if (EE.listenerCount(src, 'data') > 0)
      emitDataEvents(src);
    return;
  }

  // at this point, no one needed a drain, so we just ran out of data
  // on the next readable event, start it over again.
  state.ranOut = true;
}

function pipeOnReadable() {
  if (this._readableState.ranOut) {
    this._readableState.ranOut = false;
    flow(this);
  }
}


Readable.prototype.unpipe = function(dest) {
  var state = this._readableState;

  // if we're not piping anywhere, then do nothing.
  if (state.pipesCount === 0)
    return this;

  // just one destination.  most common case.
  if (state.pipesCount === 1) {
    // passed in one, but it's not the right one.
    if (dest && dest !== state.pipes)
      return this;

    if (!dest)
      dest = state.pipes;

    // got a match.
    state.pipes = null;
    state.pipesCount = 0;
    this.removeListener('readable', pipeOnReadable);
    state.flowing = false;
    if (dest)
      dest.emit('unpipe', this);
    return this;
  }

  // slow case. multiple pipe destinations.

  if (!dest) {
    // remove all.
    var dests = state.pipes;
    var len = state.pipesCount;
    state.pipes = null;
    state.pipesCount = 0;
    this.removeListener('readable', pipeOnReadable);
    state.flowing = false;

    for (var i = 0; i < len; i++)
      dests[i].emit('unpipe', this);
    return this;
  }

  // try to find the right one.
  var i = indexOf(state.pipes, dest);
  if (i === -1)
    return this;

  state.pipes.splice(i, 1);
  state.pipesCount -= 1;
  if (state.pipesCount === 1)
    state.pipes = state.pipes[0];

  dest.emit('unpipe', this);

  return this;
};

// set up data events if they are asked for
// Ensure readable listeners eventually get something
Readable.prototype.on = function(ev, fn) {
  var res = Stream.prototype.on.call(this, ev, fn);

  if (ev === 'data' && !this._readableState.flowing)
    emitDataEvents(this);

  if (ev === 'readable' && this.readable) {
    var state = this._readableState;
    if (!state.readableListening) {
      state.readableListening = true;
      state.emittedReadable = false;
      state.needReadable = true;
      if (!state.reading) {
        this.read(0);
      } else if (state.length) {
        emitReadable(this, state);
      }
    }
  }

  return res;
};
Readable.prototype.addListener = Readable.prototype.on;

// pause() and resume() are remnants of the legacy readable stream API
// If the user uses them, then switch into old mode.
Readable.prototype.resume = function() {
  emitDataEvents(this);
  this.read(0);
  this.emit('resume');
};

Readable.prototype.pause = function() {
  emitDataEvents(this, true);
  this.emit('pause');
};

function emitDataEvents(stream, startPaused) {
  var state = stream._readableState;

  if (state.flowing) {
    // https://github.com/isaacs/readable-stream/issues/16
    throw new Error('Cannot switch to old mode now.');
  }

  var paused = startPaused || false;
  var readable = false;

  // convert to an old-style stream.
  stream.readable = true;
  stream.pipe = Stream.prototype.pipe;
  stream.on = stream.addListener = Stream.prototype.on;

  stream.on('readable', function() {
    readable = true;

    var c;
    while (!paused && (null !== (c = stream.read())))
      stream.emit('data', c);

    if (c === null) {
      readable = false;
      stream._readableState.needReadable = true;
    }
  });

  stream.pause = function() {
    paused = true;
    this.emit('pause');
  };

  stream.resume = function() {
    paused = false;
    if (readable)
      process.nextTick(function() {
        stream.emit('readable');
      });
    else
      this.read(0);
    this.emit('resume');
  };

  // now make it start, just in case it hadn't already.
  stream.emit('readable');
}

// wrap an old-style stream as the async data source.
// This is *not* part of the readable stream interface.
// It is an ugly unfortunate mess of history.
Readable.prototype.wrap = function(stream) {
  var state = this._readableState;
  var paused = false;

  var self = this;
  stream.on('end', function() {
    if (state.decoder && !state.ended) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length)
        self.push(chunk);
    }

    self.push(null);
  });

  stream.on('data', function(chunk) {
    if (state.decoder)
      chunk = state.decoder.write(chunk);
    if (!chunk || !state.objectMode && !chunk.length)
      return;

    var ret = self.push(chunk);
    if (!ret) {
      paused = true;
      stream.pause();
    }
  });

  // proxy all the other methods.
  // important when wrapping filters and duplexes.
  for (var i in stream) {
    if (typeof stream[i] === 'function' &&
        typeof this[i] === 'undefined') {
      this[i] = function(method) { return function() {
        return stream[method].apply(stream, arguments);
      }}(i);
    }
  }

  // proxy certain important events.
  var events = ['error', 'close', 'destroy', 'pause', 'resume'];
  forEach(events, function(ev) {
    stream.on(ev, self.emit.bind(self, ev));
  });

  // when we try to consume some more bytes, simply unpause the
  // underlying stream.
  self._read = function(n) {
    if (paused) {
      paused = false;
      stream.resume();
    }
  };

  return self;
};



// exposed for testing purposes only.
Readable._fromList = fromList;

// Pluck off n bytes from an array of buffers.
// Length is the combined lengths of all the buffers in the list.
function fromList(n, state) {
  var list = state.buffer;
  var length = state.length;
  var stringMode = !!state.decoder;
  var objectMode = !!state.objectMode;
  var ret;

  // nothing in the list, definitely empty.
  if (list.length === 0)
    return null;

  if (length === 0)
    ret = null;
  else if (objectMode)
    ret = list.shift();
  else if (!n || n >= length) {
    // read it all, truncate the array.
    if (stringMode)
      ret = list.join('');
    else
      ret = Buffer.concat(list, length);
    list.length = 0;
  } else {
    // read just some of it.
    if (n < list[0].length) {
      // just take a part of the first list item.
      // slice is the same for buffers and strings.
      var buf = list[0];
      ret = buf.slice(0, n);
      list[0] = buf.slice(n);
    } else if (n === list[0].length) {
      // first list is a perfect match
      ret = list.shift();
    } else {
      // complex case.
      // we have enough to cover it, but it spans past the first buffer.
      if (stringMode)
        ret = '';
      else
        ret = new Buffer(n);

      var c = 0;
      for (var i = 0, l = list.length; i < l && c < n; i++) {
        var buf = list[0];
        var cpy = Math.min(n - c, buf.length);

        if (stringMode)
          ret += buf.slice(0, cpy);
        else
          buf.copy(ret, c, 0, cpy);

        if (cpy < buf.length)
          list[0] = buf.slice(cpy);
        else
          list.shift();

        c += cpy;
      }
    }
  }

  return ret;
}

function endReadable(stream) {
  var state = stream._readableState;

  // If we get here before consuming all the bytes, then that is a
  // bug in node.  Should never happen.
  if (state.length > 0)
    throw new Error('endReadable called on non-empty stream');

  if (!state.endEmitted && state.calledRead) {
    state.ended = true;
    process.nextTick(function() {
      // Check that we didn't get one last unshift.
      if (!state.endEmitted && state.length === 0) {
        state.endEmitted = true;
        stream.readable = false;
        stream.emit('end');
      }
    });
  }
}

function forEach (xs, f) {
  for (var i = 0, l = xs.length; i < l; i++) {
    f(xs[i], i);
  }
}

function indexOf (xs, x) {
  for (var i = 0, l = xs.length; i < l; i++) {
    if (xs[i] === x) return i;
  }
  return -1;
}

}).call(this,require('_process'))
},{"_process":9,"buffer":2,"core-util-is":16,"events":5,"inherits":6,"isarray":7,"stream":22,"string_decoder/":17}],14:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.


// a transform stream is a readable/writable stream where you do
// something with the data.  Sometimes it's called a "filter",
// but that's not a great name for it, since that implies a thing where
// some bits pass through, and others are simply ignored.  (That would
// be a valid example of a transform, of course.)
//
// While the output is causally related to the input, it's not a
// necessarily symmetric or synchronous transformation.  For example,
// a zlib stream might take multiple plain-text writes(), and then
// emit a single compressed chunk some time in the future.
//
// Here's how this works:
//
// The Transform stream has all the aspects of the readable and writable
// stream classes.  When you write(chunk), that calls _write(chunk,cb)
// internally, and returns false if there's a lot of pending writes
// buffered up.  When you call read(), that calls _read(n) until
// there's enough pending readable data buffered up.
//
// In a transform stream, the written data is placed in a buffer.  When
// _read(n) is called, it transforms the queued up data, calling the
// buffered _write cb's as it consumes chunks.  If consuming a single
// written chunk would result in multiple output chunks, then the first
// outputted bit calls the readcb, and subsequent chunks just go into
// the read buffer, and will cause it to emit 'readable' if necessary.
//
// This way, back-pressure is actually determined by the reading side,
// since _read has to be called to start processing a new chunk.  However,
// a pathological inflate type of transform can cause excessive buffering
// here.  For example, imagine a stream where every byte of input is
// interpreted as an integer from 0-255, and then results in that many
// bytes of output.  Writing the 4 bytes {ff,ff,ff,ff} would result in
// 1kb of data being output.  In this case, you could write a very small
// amount of input, and end up with a very large amount of output.  In
// such a pathological inflating mechanism, there'd be no way to tell
// the system to stop doing the transform.  A single 4MB write could
// cause the system to run out of memory.
//
// However, even in such a pathological case, only a single written chunk
// would be consumed, and then the rest would wait (un-transformed) until
// the results of the previous transformed chunk were consumed.

module.exports = Transform;

var Duplex = require('./_stream_duplex');

/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/

util.inherits(Transform, Duplex);


function TransformState(options, stream) {
  this.afterTransform = function(er, data) {
    return afterTransform(stream, er, data);
  };

  this.needTransform = false;
  this.transforming = false;
  this.writecb = null;
  this.writechunk = null;
}

function afterTransform(stream, er, data) {
  var ts = stream._transformState;
  ts.transforming = false;

  var cb = ts.writecb;

  if (!cb)
    return stream.emit('error', new Error('no writecb in Transform class'));

  ts.writechunk = null;
  ts.writecb = null;

  if (data !== null && data !== undefined)
    stream.push(data);

  if (cb)
    cb(er);

  var rs = stream._readableState;
  rs.reading = false;
  if (rs.needReadable || rs.length < rs.highWaterMark) {
    stream._read(rs.highWaterMark);
  }
}


function Transform(options) {
  if (!(this instanceof Transform))
    return new Transform(options);

  Duplex.call(this, options);

  var ts = this._transformState = new TransformState(options, this);

  // when the writable side finishes, then flush out anything remaining.
  var stream = this;

  // start out asking for a readable event once data is transformed.
  this._readableState.needReadable = true;

  // we have implemented the _read method, and done the other things
  // that Readable wants before the first _read call, so unset the
  // sync guard flag.
  this._readableState.sync = false;

  this.once('finish', function() {
    if ('function' === typeof this._flush)
      this._flush(function(er) {
        done(stream, er);
      });
    else
      done(stream);
  });
}

Transform.prototype.push = function(chunk, encoding) {
  this._transformState.needTransform = false;
  return Duplex.prototype.push.call(this, chunk, encoding);
};

// This is the part where you do stuff!
// override this function in implementation classes.
// 'chunk' is an input chunk.
//
// Call `push(newChunk)` to pass along transformed output
// to the readable side.  You may call 'push' zero or more times.
//
// Call `cb(err)` when you are done with this chunk.  If you pass
// an error, then that'll put the hurt on the whole operation.  If you
// never call cb(), then you'll never get another chunk.
Transform.prototype._transform = function(chunk, encoding, cb) {
  throw new Error('not implemented');
};

Transform.prototype._write = function(chunk, encoding, cb) {
  var ts = this._transformState;
  ts.writecb = cb;
  ts.writechunk = chunk;
  ts.writeencoding = encoding;
  if (!ts.transforming) {
    var rs = this._readableState;
    if (ts.needTransform ||
        rs.needReadable ||
        rs.length < rs.highWaterMark)
      this._read(rs.highWaterMark);
  }
};

// Doesn't matter what the args are here.
// _transform does all the work.
// That we got here means that the readable side wants more data.
Transform.prototype._read = function(n) {
  var ts = this._transformState;

  if (ts.writechunk !== null && ts.writecb && !ts.transforming) {
    ts.transforming = true;
    this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
  } else {
    // mark that we need a transform, so that any data that comes in
    // will get processed, now that we've asked for it.
    ts.needTransform = true;
  }
};


function done(stream, er) {
  if (er)
    return stream.emit('error', er);

  // if there's nothing in the write buffer, then that means
  // that nothing more will ever be provided
  var ws = stream._writableState;
  var rs = stream._readableState;
  var ts = stream._transformState;

  if (ws.length)
    throw new Error('calling transform done when ws.length != 0');

  if (ts.transforming)
    throw new Error('calling transform done when still transforming');

  return stream.push(null);
}

},{"./_stream_duplex":11,"core-util-is":16,"inherits":6}],15:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// A bit simpler than readable streams.
// Implement an async ._write(chunk, cb), and it'll handle all
// the drain event emission and buffering.

module.exports = Writable;

/*<replacement>*/
var Buffer = require('buffer').Buffer;
/*</replacement>*/

Writable.WritableState = WritableState;


/*<replacement>*/
var util = require('core-util-is');
util.inherits = require('inherits');
/*</replacement>*/


var Stream = require('stream');

util.inherits(Writable, Stream);

function WriteReq(chunk, encoding, cb) {
  this.chunk = chunk;
  this.encoding = encoding;
  this.callback = cb;
}

function WritableState(options, stream) {
  options = options || {};

  // the point at which write() starts returning false
  // Note: 0 is a valid value, means that we always return false if
  // the entire buffer is not flushed immediately on write()
  var hwm = options.highWaterMark;
  this.highWaterMark = (hwm || hwm === 0) ? hwm : 16 * 1024;

  // object stream flag to indicate whether or not this stream
  // contains buffers or objects.
  this.objectMode = !!options.objectMode;

  // cast to ints.
  this.highWaterMark = ~~this.highWaterMark;

  this.needDrain = false;
  // at the start of calling end()
  this.ending = false;
  // when end() has been called, and returned
  this.ended = false;
  // when 'finish' is emitted
  this.finished = false;

  // should we decode strings into buffers before passing to _write?
  // this is here so that some node-core streams can optimize string
  // handling at a lower level.
  var noDecode = options.decodeStrings === false;
  this.decodeStrings = !noDecode;

  // Crypto is kind of old and crusty.  Historically, its default string
  // encoding is 'binary' so we have to make this configurable.
  // Everything else in the universe uses 'utf8', though.
  this.defaultEncoding = options.defaultEncoding || 'utf8';

  // not an actual buffer we keep track of, but a measurement
  // of how much we're waiting to get pushed to some underlying
  // socket or file.
  this.length = 0;

  // a flag to see when we're in the middle of a write.
  this.writing = false;

  // a flag to be able to tell if the onwrite cb is called immediately,
  // or on a later tick.  We set this to true at first, becuase any
  // actions that shouldn't happen until "later" should generally also
  // not happen before the first write call.
  this.sync = true;

  // a flag to know if we're processing previously buffered items, which
  // may call the _write() callback in the same tick, so that we don't
  // end up in an overlapped onwrite situation.
  this.bufferProcessing = false;

  // the callback that's passed to _write(chunk,cb)
  this.onwrite = function(er) {
    onwrite(stream, er);
  };

  // the callback that the user supplies to write(chunk,encoding,cb)
  this.writecb = null;

  // the amount that is being written when _write is called.
  this.writelen = 0;

  this.buffer = [];

  // True if the error was already emitted and should not be thrown again
  this.errorEmitted = false;
}

function Writable(options) {
  var Duplex = require('./_stream_duplex');

  // Writable ctor is applied to Duplexes, though they're not
  // instanceof Writable, they're instanceof Readable.
  if (!(this instanceof Writable) && !(this instanceof Duplex))
    return new Writable(options);

  this._writableState = new WritableState(options, this);

  // legacy.
  this.writable = true;

  Stream.call(this);
}

// Otherwise people can pipe Writable streams, which is just wrong.
Writable.prototype.pipe = function() {
  this.emit('error', new Error('Cannot pipe. Not readable.'));
};


function writeAfterEnd(stream, state, cb) {
  var er = new Error('write after end');
  // TODO: defer error events consistently everywhere, not just the cb
  stream.emit('error', er);
  process.nextTick(function() {
    cb(er);
  });
}

// If we get something that is not a buffer, string, null, or undefined,
// and we're not in objectMode, then that's an error.
// Otherwise stream chunks are all considered to be of length=1, and the
// watermarks determine how many objects to keep in the buffer, rather than
// how many bytes or characters.
function validChunk(stream, state, chunk, cb) {
  var valid = true;
  if (!Buffer.isBuffer(chunk) &&
      'string' !== typeof chunk &&
      chunk !== null &&
      chunk !== undefined &&
      !state.objectMode) {
    var er = new TypeError('Invalid non-string/buffer chunk');
    stream.emit('error', er);
    process.nextTick(function() {
      cb(er);
    });
    valid = false;
  }
  return valid;
}

Writable.prototype.write = function(chunk, encoding, cb) {
  var state = this._writableState;
  var ret = false;

  if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (Buffer.isBuffer(chunk))
    encoding = 'buffer';
  else if (!encoding)
    encoding = state.defaultEncoding;

  if (typeof cb !== 'function')
    cb = function() {};

  if (state.ended)
    writeAfterEnd(this, state, cb);
  else if (validChunk(this, state, chunk, cb))
    ret = writeOrBuffer(this, state, chunk, encoding, cb);

  return ret;
};

function decodeChunk(state, chunk, encoding) {
  if (!state.objectMode &&
      state.decodeStrings !== false &&
      typeof chunk === 'string') {
    chunk = new Buffer(chunk, encoding);
  }
  return chunk;
}

// if we're already writing something, then just put this
// in the queue, and wait our turn.  Otherwise, call _write
// If we return false, then we need a drain event, so set that flag.
function writeOrBuffer(stream, state, chunk, encoding, cb) {
  chunk = decodeChunk(state, chunk, encoding);
  if (Buffer.isBuffer(chunk))
    encoding = 'buffer';
  var len = state.objectMode ? 1 : chunk.length;

  state.length += len;

  var ret = state.length < state.highWaterMark;
  // we must ensure that previous needDrain will not be reset to false.
  if (!ret)
    state.needDrain = true;

  if (state.writing)
    state.buffer.push(new WriteReq(chunk, encoding, cb));
  else
    doWrite(stream, state, len, chunk, encoding, cb);

  return ret;
}

function doWrite(stream, state, len, chunk, encoding, cb) {
  state.writelen = len;
  state.writecb = cb;
  state.writing = true;
  state.sync = true;
  stream._write(chunk, encoding, state.onwrite);
  state.sync = false;
}

function onwriteError(stream, state, sync, er, cb) {
  if (sync)
    process.nextTick(function() {
      cb(er);
    });
  else
    cb(er);

  stream._writableState.errorEmitted = true;
  stream.emit('error', er);
}

function onwriteStateUpdate(state) {
  state.writing = false;
  state.writecb = null;
  state.length -= state.writelen;
  state.writelen = 0;
}

function onwrite(stream, er) {
  var state = stream._writableState;
  var sync = state.sync;
  var cb = state.writecb;

  onwriteStateUpdate(state);

  if (er)
    onwriteError(stream, state, sync, er, cb);
  else {
    // Check if we're actually ready to finish, but don't emit yet
    var finished = needFinish(stream, state);

    if (!finished && !state.bufferProcessing && state.buffer.length)
      clearBuffer(stream, state);

    if (sync) {
      process.nextTick(function() {
        afterWrite(stream, state, finished, cb);
      });
    } else {
      afterWrite(stream, state, finished, cb);
    }
  }
}

function afterWrite(stream, state, finished, cb) {
  if (!finished)
    onwriteDrain(stream, state);
  cb();
  if (finished)
    finishMaybe(stream, state);
}

// Must force callback to be called on nextTick, so that we don't
// emit 'drain' before the write() consumer gets the 'false' return
// value, and has a chance to attach a 'drain' listener.
function onwriteDrain(stream, state) {
  if (state.length === 0 && state.needDrain) {
    state.needDrain = false;
    stream.emit('drain');
  }
}


// if there's something in the buffer waiting, then process it
function clearBuffer(stream, state) {
  state.bufferProcessing = true;

  for (var c = 0; c < state.buffer.length; c++) {
    var entry = state.buffer[c];
    var chunk = entry.chunk;
    var encoding = entry.encoding;
    var cb = entry.callback;
    var len = state.objectMode ? 1 : chunk.length;

    doWrite(stream, state, len, chunk, encoding, cb);

    // if we didn't call the onwrite immediately, then
    // it means that we need to wait until it does.
    // also, that means that the chunk and cb are currently
    // being processed, so move the buffer counter past them.
    if (state.writing) {
      c++;
      break;
    }
  }

  state.bufferProcessing = false;
  if (c < state.buffer.length)
    state.buffer = state.buffer.slice(c);
  else
    state.buffer.length = 0;
}

Writable.prototype._write = function(chunk, encoding, cb) {
  cb(new Error('not implemented'));
};

Writable.prototype.end = function(chunk, encoding, cb) {
  var state = this._writableState;

  if (typeof chunk === 'function') {
    cb = chunk;
    chunk = null;
    encoding = null;
  } else if (typeof encoding === 'function') {
    cb = encoding;
    encoding = null;
  }

  if (typeof chunk !== 'undefined' && chunk !== null)
    this.write(chunk, encoding);

  // ignore unnecessary end() calls.
  if (!state.ending && !state.finished)
    endWritable(this, state, cb);
};


function needFinish(stream, state) {
  return (state.ending &&
          state.length === 0 &&
          !state.finished &&
          !state.writing);
}

function finishMaybe(stream, state) {
  var need = needFinish(stream, state);
  if (need) {
    state.finished = true;
    stream.emit('finish');
  }
  return need;
}

function endWritable(stream, state, cb) {
  state.ending = true;
  finishMaybe(stream, state);
  if (cb) {
    if (state.finished)
      process.nextTick(cb);
    else
      stream.once('finish', cb);
  }
  state.ended = true;
}

}).call(this,require('_process'))
},{"./_stream_duplex":11,"_process":9,"buffer":2,"core-util-is":16,"inherits":6,"stream":22}],16:[function(require,module,exports){
(function (Buffer){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

function isBuffer(arg) {
  return Buffer.isBuffer(arg);
}
exports.isBuffer = isBuffer;

function objectToString(o) {
  return Object.prototype.toString.call(o);
}
}).call(this,require("buffer").Buffer)
},{"buffer":2}],17:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var Buffer = require('buffer').Buffer;

var isBufferEncoding = Buffer.isEncoding
  || function(encoding) {
       switch (encoding && encoding.toLowerCase()) {
         case 'hex': case 'utf8': case 'utf-8': case 'ascii': case 'binary': case 'base64': case 'ucs2': case 'ucs-2': case 'utf16le': case 'utf-16le': case 'raw': return true;
         default: return false;
       }
     }


function assertEncoding(encoding) {
  if (encoding && !isBufferEncoding(encoding)) {
    throw new Error('Unknown encoding: ' + encoding);
  }
}

var StringDecoder = exports.StringDecoder = function(encoding) {
  this.encoding = (encoding || 'utf8').toLowerCase().replace(/[-_]/, '');
  assertEncoding(encoding);
  switch (this.encoding) {
    case 'utf8':
      // CESU-8 represents each of Surrogate Pair by 3-bytes
      this.surrogateSize = 3;
      break;
    case 'ucs2':
    case 'utf16le':
      // UTF-16 represents each of Surrogate Pair by 2-bytes
      this.surrogateSize = 2;
      this.detectIncompleteChar = utf16DetectIncompleteChar;
      break;
    case 'base64':
      // Base-64 stores 3 bytes in 4 chars, and pads the remainder.
      this.surrogateSize = 3;
      this.detectIncompleteChar = base64DetectIncompleteChar;
      break;
    default:
      this.write = passThroughWrite;
      return;
  }

  this.charBuffer = new Buffer(6);
  this.charReceived = 0;
  this.charLength = 0;
};


StringDecoder.prototype.write = function(buffer) {
  var charStr = '';
  var offset = 0;

  // if our last write ended with an incomplete multibyte character
  while (this.charLength) {
    // determine how many remaining bytes this buffer has to offer for this char
    var i = (buffer.length >= this.charLength - this.charReceived) ?
                this.charLength - this.charReceived :
                buffer.length;

    // add the new bytes to the char buffer
    buffer.copy(this.charBuffer, this.charReceived, offset, i);
    this.charReceived += (i - offset);
    offset = i;

    if (this.charReceived < this.charLength) {
      // still not enough chars in this buffer? wait for more ...
      return '';
    }

    // get the character that was split
    charStr = this.charBuffer.slice(0, this.charLength).toString(this.encoding);

    // lead surrogate (D800-DBFF) is also the incomplete character
    var charCode = charStr.charCodeAt(charStr.length - 1);
    if (charCode >= 0xD800 && charCode <= 0xDBFF) {
      this.charLength += this.surrogateSize;
      charStr = '';
      continue;
    }
    this.charReceived = this.charLength = 0;

    // if there are no more bytes in this buffer, just emit our char
    if (i == buffer.length) return charStr;

    // otherwise cut off the characters end from the beginning of this buffer
    buffer = buffer.slice(i, buffer.length);
    break;
  }

  var lenIncomplete = this.detectIncompleteChar(buffer);

  var end = buffer.length;
  if (this.charLength) {
    // buffer the incomplete character bytes we got
    buffer.copy(this.charBuffer, 0, buffer.length - lenIncomplete, end);
    this.charReceived = lenIncomplete;
    end -= lenIncomplete;
  }

  charStr += buffer.toString(this.encoding, 0, end);

  var end = charStr.length - 1;
  var charCode = charStr.charCodeAt(end);
  // lead surrogate (D800-DBFF) is also the incomplete character
  if (charCode >= 0xD800 && charCode <= 0xDBFF) {
    var size = this.surrogateSize;
    this.charLength += size;
    this.charReceived += size;
    this.charBuffer.copy(this.charBuffer, size, 0, size);
    this.charBuffer.write(charStr.charAt(charStr.length - 1), this.encoding);
    return charStr.substring(0, end);
  }

  // or just emit the charStr
  return charStr;
};

StringDecoder.prototype.detectIncompleteChar = function(buffer) {
  // determine how many bytes we have to check at the end of this buffer
  var i = (buffer.length >= 3) ? 3 : buffer.length;

  // Figure out if one of the last i bytes of our buffer announces an
  // incomplete char.
  for (; i > 0; i--) {
    var c = buffer[buffer.length - i];

    // See http://en.wikipedia.org/wiki/UTF-8#Description

    // 110XXXXX
    if (i == 1 && c >> 5 == 0x06) {
      this.charLength = 2;
      break;
    }

    // 1110XXXX
    if (i <= 2 && c >> 4 == 0x0E) {
      this.charLength = 3;
      break;
    }

    // 11110XXX
    if (i <= 3 && c >> 3 == 0x1E) {
      this.charLength = 4;
      break;
    }
  }

  return i;
};

StringDecoder.prototype.end = function(buffer) {
  var res = '';
  if (buffer && buffer.length)
    res = this.write(buffer);

  if (this.charReceived) {
    var cr = this.charReceived;
    var buf = this.charBuffer;
    var enc = this.encoding;
    res += buf.slice(0, cr).toString(enc);
  }

  return res;
};

function passThroughWrite(buffer) {
  return buffer.toString(this.encoding);
}

function utf16DetectIncompleteChar(buffer) {
  var incomplete = this.charReceived = buffer.length % 2;
  this.charLength = incomplete ? 2 : 0;
  return incomplete;
}

function base64DetectIncompleteChar(buffer) {
  var incomplete = this.charReceived = buffer.length % 3;
  this.charLength = incomplete ? 3 : 0;
  return incomplete;
}

},{"buffer":2}],18:[function(require,module,exports){
module.exports = require("./lib/_stream_passthrough.js")

},{"./lib/_stream_passthrough.js":12}],19:[function(require,module,exports){
exports = module.exports = require('./lib/_stream_readable.js');
exports.Readable = exports;
exports.Writable = require('./lib/_stream_writable.js');
exports.Duplex = require('./lib/_stream_duplex.js');
exports.Transform = require('./lib/_stream_transform.js');
exports.PassThrough = require('./lib/_stream_passthrough.js');

},{"./lib/_stream_duplex.js":11,"./lib/_stream_passthrough.js":12,"./lib/_stream_readable.js":13,"./lib/_stream_transform.js":14,"./lib/_stream_writable.js":15}],20:[function(require,module,exports){
module.exports = require("./lib/_stream_transform.js")

},{"./lib/_stream_transform.js":14}],21:[function(require,module,exports){
module.exports = require("./lib/_stream_writable.js")

},{"./lib/_stream_writable.js":15}],22:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

module.exports = Stream;

var EE = require('events').EventEmitter;
var inherits = require('inherits');

inherits(Stream, EE);
Stream.Readable = require('readable-stream/readable.js');
Stream.Writable = require('readable-stream/writable.js');
Stream.Duplex = require('readable-stream/duplex.js');
Stream.Transform = require('readable-stream/transform.js');
Stream.PassThrough = require('readable-stream/passthrough.js');

// Backwards-compat with node 0.4.x
Stream.Stream = Stream;



// old-style streams.  Note that the pipe method (the only relevant
// part of this class) is overridden in the Readable class.

function Stream() {
  EE.call(this);
}

Stream.prototype.pipe = function(dest, options) {
  var source = this;

  function ondata(chunk) {
    if (dest.writable) {
      if (false === dest.write(chunk) && source.pause) {
        source.pause();
      }
    }
  }

  source.on('data', ondata);

  function ondrain() {
    if (source.readable && source.resume) {
      source.resume();
    }
  }

  dest.on('drain', ondrain);

  // If the 'end' option is not supplied, dest.end() will be called when
  // source gets the 'end' or 'close' events.  Only dest.end() once.
  if (!dest._isStdio && (!options || options.end !== false)) {
    source.on('end', onend);
    source.on('close', onclose);
  }

  var didOnEnd = false;
  function onend() {
    if (didOnEnd) return;
    didOnEnd = true;

    dest.end();
  }


  function onclose() {
    if (didOnEnd) return;
    didOnEnd = true;

    if (typeof dest.destroy === 'function') dest.destroy();
  }

  // don't leave dangling pipes when there are errors.
  function onerror(er) {
    cleanup();
    if (EE.listenerCount(this, 'error') === 0) {
      throw er; // Unhandled stream error in pipe.
    }
  }

  source.on('error', onerror);
  dest.on('error', onerror);

  // remove all the event listeners that were added.
  function cleanup() {
    source.removeListener('data', ondata);
    dest.removeListener('drain', ondrain);

    source.removeListener('end', onend);
    source.removeListener('close', onclose);

    source.removeListener('error', onerror);
    dest.removeListener('error', onerror);

    source.removeListener('end', cleanup);
    source.removeListener('close', cleanup);

    dest.removeListener('close', cleanup);
  }

  source.on('end', cleanup);
  source.on('close', cleanup);

  dest.on('close', cleanup);

  dest.emit('pipe', source);

  // Allow for unix-like usage: A.pipe(B).pipe(C)
  return dest;
};

},{"events":5,"inherits":6,"readable-stream/duplex.js":10,"readable-stream/passthrough.js":18,"readable-stream/readable.js":19,"readable-stream/transform.js":20,"readable-stream/writable.js":21}],23:[function(require,module,exports){
'use strict';

var _interopRequireDefault = function (obj) { return obj && obj.__esModule ? obj : { 'default': obj }; };

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } };

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(object, property, receiver) { var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ('value' in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _inherits = function (subClass, superClass) { if (typeof superClass !== 'function' && superClass !== null) { throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) subClass.__proto__ = superClass; };

Object.defineProperty(exports, '__esModule', {
	value: true
});

var _m = require('mori');

var _m2 = _interopRequireDefault(_m);

var _Store2 = require('./Store');

var _Store3 = _interopRequireDefault(_Store2);

var _server = require('./server');

var _server2 = _interopRequireDefault(_server);

var STATE_LOADING = 'loading';
var STATE_LOADED = 'loaded';
var STATE_ERROR = 'error';

var ServerStore = (function (_Store) {
	function ServerStore(namespace, loadArity) {
		_classCallCheck(this, ServerStore);

		_get(Object.getPrototypeOf(ServerStore.prototype), 'constructor', this).call(this);

		if (!loadArity) {
			throw 'Must specify a load arity';
		}

		this._namespace = namespace;
		// From deep to shallow
		this._loadArity = loadArity.sort(function (a, b) {
			return b - a;
		});

		this._cache = _m2['default'].hashMap();
		this._loading = _m2['default'].hashMap();
	}

	_inherits(ServerStore, _Store);

	_createClass(ServerStore, [{
		key: 'get',
		value: function get(keys) {
			var local = _m2['default'].getIn(this._data, keys),
			    cache = _m2['default'].getIn(this._cache, keys);
			if (local !== null) {
				if (_m2['default'].isMap(local) && _m2['default'].isMap(cache)) {
					return _m2['default'].merge(cache, local);
				}
				return local;
			}
			if (cache) {
				return cache;
			}

			this._load(keys);
			return null;
		}
	}, {
		key: 'isLoading',
		value: function isLoading(keys) {
			return this._loadingState(keys) == STATE_LOADING;
		}
	}, {
		key: 'isError',
		value: function isError(keys) {
			return this._loadingState(keys) == STATE_ERROR;
		}
	}, {
		key: '_load',
		value: function _load(keys) {
			var _this = this;

			if (this._loadingState(keys)) {
				return this._loadingState(keys);
			}

			var keys_to_load = _m2['default'].take(keys, this._loadArity[0]);
			this._loading = _m2['default'].assoc(this._loading, keys_to_load, STATE_LOADING);
			_server2['default'](this._namespace, 'load', { keys: _m2['default'].toJs(keys_to_load) }).then(function (value) {
				_this._loading = _m2['default'].assoc(_this._loading, keys_to_load, STATE_LOADED);
				_this._setCache(keys_to_load, value);
			}, function () {
				_this._loading = _m2['default'].assoc(_this._loading, keys_to_load, STATE_ERROR);
			});
		}
	}, {
		key: '_loadingState',
		value: function _loadingState(keys) {
			var _this2 = this;

			var keyCombos = _m2['default'].map(function (arity) {
				return _m2['default'].take(arity, keys);
			}, this._loadArity);

			_m2['default'].each(keyCombos, function (combo) {
				if (_m2['default'].get(_this2._loading, combo)) {
					return _m2['default'].get(_this2._loading, combo);
				}
			});
		}
	}, {
		key: '_setCache',
		value: function _setCache(keys, value) {
			this._cache = _m2['default'].assocIn(this._cache, keys, value);
			this._notify(keys);
		}
	}]);

	return ServerStore;
})(_Store3['default']);

exports['default'] = ServerStore;
module.exports = exports['default'];

module.exports.__get__ = function __get__() {
    arguments.varName = arguments[0];
    if (arguments.varName && typeof arguments.varName === "string") {
        return eval(arguments.varName);
    } else {
        throw new TypeError("__get__ expects a non-empty string");
    }
};
module.exports.__set__ = function __set__() {
    arguments.varName = arguments[0];
    arguments.varValue = arguments[1];
    arguments.src = "";

    if (typeof arguments[0] === "object" && arguments.length === 1) {
        arguments.env = arguments.varName;
        if (!arguments.env || Array.isArray(arguments.env)) {
            throw new TypeError("__set__ expects an object as env");
        }
        for (arguments.varName in arguments.env) {
            if (arguments.env.hasOwnProperty(arguments.varName)) {
                arguments.varValue = arguments.env[arguments.varName];
                arguments.src += arguments.varName + " = arguments.env." + arguments.varName + "; ";
            }
        }
    } else if (typeof arguments.varName === "string" && arguments.length === 2) {
        if (!arguments.varName) {
            throw new TypeError("__set__ expects a non-empty string as a variable name");
        }
        arguments.src = arguments.varName + " = arguments.varValue;";
    } else {
        throw new TypeError("__set__ expects an environment object or a non-empty string as a variable name");
    }

    eval(arguments.src);
};

},{"./Store":24,"./server":40,"mori":26}],24:[function(require,module,exports){
'use strict';

var _interopRequireDefault = function (obj) { return obj && obj.__esModule ? obj : { 'default': obj }; };

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } };

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

Object.defineProperty(exports, '__esModule', {
	value: true
});

var _m = require('mori');

var _m2 = _interopRequireDefault(_m);

var Store = (function () {
	function Store() {
		_classCallCheck(this, Store);

		this._subscribers = _m2['default'].hashMap();
		this._data = _m2['default'].hashMap();
	}

	_createClass(Store, [{
		key: 'get',
		value: function get(keys) {
			return _m2['default'].getIn(this._data, keys);
		}
	}, {
		key: 'set',
		value: function set(keys, value) {
			this._data = _m2['default'].assocIn(this._data, keys, value);
			this._notify(keys);
		}
	}, {
		key: '_notify',
		value: function _notify(keys) {
			var _this = this;

			var self = this;

			// Get the key path ([a b c] -> [[a] [a b] [a b c]])
			var keyCombos = _m2['default'].reduce(function (acc, key) {
				return _m2['default'].conj(acc, _m2['default'].conj(_m2['default'].last(acc) || _m2['default'].vector(), key));
			}, _m2['default'].vector(), keys);

			// Go through each key combo, then each subscriber, and trigger them.
			_m2['default'].each(keyCombos, function (keyCombo) {
				_m2['default'].each(_m2['default'].get(_this._subscribers, keyCombo), function (subscriber) {
					subscriber();
				});
			});
		}
	}, {
		key: 'subscribe',
		value: function subscribe(keys, fn) {
			var k = _m2['default'].toClj(keys),
			    previous_subscribers = _m2['default'].get(this._subscribers, k),
			    new_subscribers = _m2['default'].conj(previous_subscribers || _m2['default'].set(), fn);
			this._subscribers = _m2['default'].assoc(this._subscribers, k, _m2['default'].conj(new_subscribers, fn));
		}
	}, {
		key: 'unsubscribe',
		value: function unsubscribe(keys, fn) {
			var k = _m2['default'].toClj(keys);
			this._subscribers = _m2['default'].assoc(this._subscribers, k, _m2['default'].disj(_m2['default'].get(this._subscribers, k), fn));
		}
	}]);

	return Store;
})();

exports['default'] = Store;
module.exports = exports['default'];

module.exports.__get__ = function __get__() {
    arguments.varName = arguments[0];
    if (arguments.varName && typeof arguments.varName === "string") {
        return eval(arguments.varName);
    } else {
        throw new TypeError("__get__ expects a non-empty string");
    }
};
module.exports.__set__ = function __set__() {
    arguments.varName = arguments[0];
    arguments.varValue = arguments[1];
    arguments.src = "";

    if (typeof arguments[0] === "object" && arguments.length === 1) {
        arguments.env = arguments.varName;
        if (!arguments.env || Array.isArray(arguments.env)) {
            throw new TypeError("__set__ expects an object as env");
        }
        for (arguments.varName in arguments.env) {
            if (arguments.env.hasOwnProperty(arguments.varName)) {
                arguments.varValue = arguments.env[arguments.varName];
                arguments.src += arguments.varName + " = arguments.env." + arguments.varName + "; ";
            }
        }
    } else if (typeof arguments.varName === "string" && arguments.length === 2) {
        if (!arguments.varName) {
            throw new TypeError("__set__ expects a non-empty string as a variable name");
        }
        arguments.src = arguments.varName + " = arguments.varValue;";
    } else {
        throw new TypeError("__set__ expects an environment object or a non-empty string as a variable name");
    }

    eval(arguments.src);
};

},{"mori":26}],25:[function(require,module,exports){
(function (process,global){
/* @preserve
 * The MIT License (MIT)
 * 
 * Copyright (c) 2014 Petka Antonov
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:</p>
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 * 
 */
/**
 * bluebird build version 2.9.24
 * Features enabled: core, race, call_get, generators, map, nodeify, promisify, props, reduce, settle, some, cancel, using, filter, any, each, timers
*/
!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.Promise=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof _dereq_=="function"&&_dereq_;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof _dereq_=="function"&&_dereq_;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise) {
var SomePromiseArray = Promise._SomePromiseArray;
function any(promises) {
    var ret = new SomePromiseArray(promises);
    var promise = ret.promise();
    ret.setHowMany(1);
    ret.setUnwrap();
    ret.init();
    return promise;
}

Promise.any = function (promises) {
    return any(promises);
};

Promise.prototype.any = function () {
    return any(this);
};

};

},{}],2:[function(_dereq_,module,exports){
"use strict";
var firstLineError;
try {throw new Error(); } catch (e) {firstLineError = e;}
var schedule = _dereq_("./schedule.js");
var Queue = _dereq_("./queue.js");
var util = _dereq_("./util.js");

function Async() {
    this._isTickUsed = false;
    this._lateQueue = new Queue(16);
    this._normalQueue = new Queue(16);
    this._trampolineEnabled = true;
    var self = this;
    this.drainQueues = function () {
        self._drainQueues();
    };
    this._schedule =
        schedule.isStatic ? schedule(this.drainQueues) : schedule;
}

Async.prototype.disableTrampolineIfNecessary = function() {
    if (util.hasDevTools) {
        this._trampolineEnabled = false;
    }
};

Async.prototype.enableTrampoline = function() {
    if (!this._trampolineEnabled) {
        this._trampolineEnabled = true;
        this._schedule = function(fn) {
            setTimeout(fn, 0);
        };
    }
};

Async.prototype.haveItemsQueued = function () {
    return this._normalQueue.length() > 0;
};

Async.prototype.throwLater = function(fn, arg) {
    if (arguments.length === 1) {
        arg = fn;
        fn = function () { throw arg; };
    }
    var domain = this._getDomain();
    if (domain !== undefined) fn = domain.bind(fn);
    if (typeof setTimeout !== "undefined") {
        setTimeout(function() {
            fn(arg);
        }, 0);
    } else try {
        this._schedule(function() {
            fn(arg);
        });
    } catch (e) {
        throw new Error("No async scheduler available\u000a\u000a    See http://goo.gl/m3OTXk\u000a");
    }
};

Async.prototype._getDomain = function() {};

if (util.isNode) {
    var EventsModule = _dereq_("events");

    var domainGetter = function() {
        var domain = process.domain;
        if (domain === null) return undefined;
        return domain;
    };

    if (EventsModule.usingDomains) {
        Async.prototype._getDomain = domainGetter;
    } else {
        var descriptor =
            Object.getOwnPropertyDescriptor(EventsModule, "usingDomains");

        if (!descriptor.configurable) {
            process.on("domainsActivated", function() {
                Async.prototype._getDomain = domainGetter;
            });
        } else {
            var usingDomains = false;
            Object.defineProperty(EventsModule, "usingDomains", {
                configurable: false,
                enumerable: true,
                get: function() {
                    return usingDomains;
                },
                set: function(value) {
                    if (usingDomains || !value) return;
                    usingDomains = true;
                    Async.prototype._getDomain = domainGetter;
                    util.toFastProperties(process);
                    process.emit("domainsActivated");
                }
            });
        }


    }
}

function AsyncInvokeLater(fn, receiver, arg) {
    var domain = this._getDomain();
    if (domain !== undefined) fn = domain.bind(fn);
    this._lateQueue.push(fn, receiver, arg);
    this._queueTick();
}

function AsyncInvoke(fn, receiver, arg) {
    var domain = this._getDomain();
    if (domain !== undefined) fn = domain.bind(fn);
    this._normalQueue.push(fn, receiver, arg);
    this._queueTick();
}

function AsyncSettlePromises(promise) {
    var domain = this._getDomain();
    if (domain !== undefined) {
        var fn = domain.bind(promise._settlePromises);
        this._normalQueue.push(fn, promise, undefined);
    } else {
        this._normalQueue._pushOne(promise);
    }
    this._queueTick();
}

if (!util.hasDevTools) {
    Async.prototype.invokeLater = AsyncInvokeLater;
    Async.prototype.invoke = AsyncInvoke;
    Async.prototype.settlePromises = AsyncSettlePromises;
} else {
    Async.prototype.invokeLater = function (fn, receiver, arg) {
        if (this._trampolineEnabled) {
            AsyncInvokeLater.call(this, fn, receiver, arg);
        } else {
            setTimeout(function() {
                fn.call(receiver, arg);
            }, 100);
        }
    };

    Async.prototype.invoke = function (fn, receiver, arg) {
        if (this._trampolineEnabled) {
            AsyncInvoke.call(this, fn, receiver, arg);
        } else {
            setTimeout(function() {
                fn.call(receiver, arg);
            }, 0);
        }
    };

    Async.prototype.settlePromises = function(promise) {
        if (this._trampolineEnabled) {
            AsyncSettlePromises.call(this, promise);
        } else {
            setTimeout(function() {
                promise._settlePromises();
            }, 0);
        }
    };
}

Async.prototype.invokeFirst = function (fn, receiver, arg) {
    var domain = this._getDomain();
    if (domain !== undefined) fn = domain.bind(fn);
    this._normalQueue.unshift(fn, receiver, arg);
    this._queueTick();
};

Async.prototype._drainQueue = function(queue) {
    while (queue.length() > 0) {
        var fn = queue.shift();
        if (typeof fn !== "function") {
            fn._settlePromises();
            continue;
        }
        var receiver = queue.shift();
        var arg = queue.shift();
        fn.call(receiver, arg);
    }
};

Async.prototype._drainQueues = function () {
    this._drainQueue(this._normalQueue);
    this._reset();
    this._drainQueue(this._lateQueue);
};

Async.prototype._queueTick = function () {
    if (!this._isTickUsed) {
        this._isTickUsed = true;
        this._schedule(this.drainQueues);
    }
};

Async.prototype._reset = function () {
    this._isTickUsed = false;
};

module.exports = new Async();
module.exports.firstLineError = firstLineError;

},{"./queue.js":28,"./schedule.js":31,"./util.js":38,"events":39}],3:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, INTERNAL, tryConvertToPromise) {
var rejectThis = function(_, e) {
    this._reject(e);
};

var targetRejected = function(e, context) {
    context.promiseRejectionQueued = true;
    context.bindingPromise._then(rejectThis, rejectThis, null, this, e);
};

var bindingResolved = function(thisArg, context) {
    this._setBoundTo(thisArg);
    if (this._isPending()) {
        this._resolveCallback(context.target);
    }
};

var bindingRejected = function(e, context) {
    if (!context.promiseRejectionQueued) this._reject(e);
};

Promise.prototype.bind = function (thisArg) {
    var maybePromise = tryConvertToPromise(thisArg);
    var ret = new Promise(INTERNAL);
    ret._propagateFrom(this, 1);
    var target = this._target();
    if (maybePromise instanceof Promise) {
        var context = {
            promiseRejectionQueued: false,
            promise: ret,
            target: target,
            bindingPromise: maybePromise
        };
        target._then(INTERNAL, targetRejected, ret._progress, ret, context);
        maybePromise._then(
            bindingResolved, bindingRejected, ret._progress, ret, context);
    } else {
        ret._setBoundTo(thisArg);
        ret._resolveCallback(target);
    }
    return ret;
};

Promise.prototype._setBoundTo = function (obj) {
    if (obj !== undefined) {
        this._bitField = this._bitField | 131072;
        this._boundTo = obj;
    } else {
        this._bitField = this._bitField & (~131072);
    }
};

Promise.prototype._isBound = function () {
    return (this._bitField & 131072) === 131072;
};

Promise.bind = function (thisArg, value) {
    var maybePromise = tryConvertToPromise(thisArg);
    var ret = new Promise(INTERNAL);

    if (maybePromise instanceof Promise) {
        maybePromise._then(function(thisArg) {
            ret._setBoundTo(thisArg);
            ret._resolveCallback(value);
        }, ret._reject, ret._progress, ret, null);
    } else {
        ret._setBoundTo(thisArg);
        ret._resolveCallback(value);
    }
    return ret;
};
};

},{}],4:[function(_dereq_,module,exports){
"use strict";
var old;
if (typeof Promise !== "undefined") old = Promise;
function noConflict() {
    try { if (Promise === bluebird) Promise = old; }
    catch (e) {}
    return bluebird;
}
var bluebird = _dereq_("./promise.js")();
bluebird.noConflict = noConflict;
module.exports = bluebird;

},{"./promise.js":23}],5:[function(_dereq_,module,exports){
"use strict";
var cr = Object.create;
if (cr) {
    var callerCache = cr(null);
    var getterCache = cr(null);
    callerCache[" size"] = getterCache[" size"] = 0;
}

module.exports = function(Promise) {
var util = _dereq_("./util.js");
var canEvaluate = util.canEvaluate;
var isIdentifier = util.isIdentifier;

var getMethodCaller;
var getGetter;
if (!true) {
var makeMethodCaller = function (methodName) {
    return new Function("ensureMethod", "                                    \n\
        return function(obj) {                                               \n\
            'use strict'                                                     \n\
            var len = this.length;                                           \n\
            ensureMethod(obj, 'methodName');                                 \n\
            switch(len) {                                                    \n\
                case 1: return obj.methodName(this[0]);                      \n\
                case 2: return obj.methodName(this[0], this[1]);             \n\
                case 3: return obj.methodName(this[0], this[1], this[2]);    \n\
                case 0: return obj.methodName();                             \n\
                default:                                                     \n\
                    return obj.methodName.apply(obj, this);                  \n\
            }                                                                \n\
        };                                                                   \n\
        ".replace(/methodName/g, methodName))(ensureMethod);
};

var makeGetter = function (propertyName) {
    return new Function("obj", "                                             \n\
        'use strict';                                                        \n\
        return obj.propertyName;                                             \n\
        ".replace("propertyName", propertyName));
};

var getCompiled = function(name, compiler, cache) {
    var ret = cache[name];
    if (typeof ret !== "function") {
        if (!isIdentifier(name)) {
            return null;
        }
        ret = compiler(name);
        cache[name] = ret;
        cache[" size"]++;
        if (cache[" size"] > 512) {
            var keys = Object.keys(cache);
            for (var i = 0; i < 256; ++i) delete cache[keys[i]];
            cache[" size"] = keys.length - 256;
        }
    }
    return ret;
};

getMethodCaller = function(name) {
    return getCompiled(name, makeMethodCaller, callerCache);
};

getGetter = function(name) {
    return getCompiled(name, makeGetter, getterCache);
};
}

function ensureMethod(obj, methodName) {
    var fn;
    if (obj != null) fn = obj[methodName];
    if (typeof fn !== "function") {
        var message = "Object " + util.classString(obj) + " has no method '" +
            util.toString(methodName) + "'";
        throw new Promise.TypeError(message);
    }
    return fn;
}

function caller(obj) {
    var methodName = this.pop();
    var fn = ensureMethod(obj, methodName);
    return fn.apply(obj, this);
}
Promise.prototype.call = function (methodName) {
    var $_len = arguments.length;var args = new Array($_len - 1); for(var $_i = 1; $_i < $_len; ++$_i) {args[$_i - 1] = arguments[$_i];}
    if (!true) {
        if (canEvaluate) {
            var maybeCaller = getMethodCaller(methodName);
            if (maybeCaller !== null) {
                return this._then(
                    maybeCaller, undefined, undefined, args, undefined);
            }
        }
    }
    args.push(methodName);
    return this._then(caller, undefined, undefined, args, undefined);
};

function namedGetter(obj) {
    return obj[this];
}
function indexedGetter(obj) {
    var index = +this;
    if (index < 0) index = Math.max(0, index + obj.length);
    return obj[index];
}
Promise.prototype.get = function (propertyName) {
    var isIndex = (typeof propertyName === "number");
    var getter;
    if (!isIndex) {
        if (canEvaluate) {
            var maybeGetter = getGetter(propertyName);
            getter = maybeGetter !== null ? maybeGetter : namedGetter;
        } else {
            getter = namedGetter;
        }
    } else {
        getter = indexedGetter;
    }
    return this._then(getter, undefined, undefined, propertyName, undefined);
};
};

},{"./util.js":38}],6:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise) {
var errors = _dereq_("./errors.js");
var async = _dereq_("./async.js");
var CancellationError = errors.CancellationError;

Promise.prototype._cancel = function (reason) {
    if (!this.isCancellable()) return this;
    var parent;
    var promiseToReject = this;
    while ((parent = promiseToReject._cancellationParent) !== undefined &&
        parent.isCancellable()) {
        promiseToReject = parent;
    }
    this._unsetCancellable();
    promiseToReject._target()._rejectCallback(reason, false, true);
};

Promise.prototype.cancel = function (reason) {
    if (!this.isCancellable()) return this;
    if (reason === undefined) reason = new CancellationError();
    async.invokeLater(this._cancel, this, reason);
    return this;
};

Promise.prototype.cancellable = function () {
    if (this._cancellable()) return this;
    async.enableTrampoline();
    this._setCancellable();
    this._cancellationParent = undefined;
    return this;
};

Promise.prototype.uncancellable = function () {
    var ret = this.then();
    ret._unsetCancellable();
    return ret;
};

Promise.prototype.fork = function (didFulfill, didReject, didProgress) {
    var ret = this._then(didFulfill, didReject, didProgress,
                         undefined, undefined);

    ret._setCancellable();
    ret._cancellationParent = undefined;
    return ret;
};
};

},{"./async.js":2,"./errors.js":13}],7:[function(_dereq_,module,exports){
"use strict";
module.exports = function() {
var async = _dereq_("./async.js");
var util = _dereq_("./util.js");
var bluebirdFramePattern =
    /[\\\/]bluebird[\\\/]js[\\\/](main|debug|zalgo|instrumented)/;
var stackFramePattern = null;
var formatStack = null;
var indentStackFrames = false;
var warn;

function CapturedTrace(parent) {
    this._parent = parent;
    var length = this._length = 1 + (parent === undefined ? 0 : parent._length);
    captureStackTrace(this, CapturedTrace);
    if (length > 32) this.uncycle();
}
util.inherits(CapturedTrace, Error);

CapturedTrace.prototype.uncycle = function() {
    var length = this._length;
    if (length < 2) return;
    var nodes = [];
    var stackToIndex = {};

    for (var i = 0, node = this; node !== undefined; ++i) {
        nodes.push(node);
        node = node._parent;
    }
    length = this._length = i;
    for (var i = length - 1; i >= 0; --i) {
        var stack = nodes[i].stack;
        if (stackToIndex[stack] === undefined) {
            stackToIndex[stack] = i;
        }
    }
    for (var i = 0; i < length; ++i) {
        var currentStack = nodes[i].stack;
        var index = stackToIndex[currentStack];
        if (index !== undefined && index !== i) {
            if (index > 0) {
                nodes[index - 1]._parent = undefined;
                nodes[index - 1]._length = 1;
            }
            nodes[i]._parent = undefined;
            nodes[i]._length = 1;
            var cycleEdgeNode = i > 0 ? nodes[i - 1] : this;

            if (index < length - 1) {
                cycleEdgeNode._parent = nodes[index + 1];
                cycleEdgeNode._parent.uncycle();
                cycleEdgeNode._length =
                    cycleEdgeNode._parent._length + 1;
            } else {
                cycleEdgeNode._parent = undefined;
                cycleEdgeNode._length = 1;
            }
            var currentChildLength = cycleEdgeNode._length + 1;
            for (var j = i - 2; j >= 0; --j) {
                nodes[j]._length = currentChildLength;
                currentChildLength++;
            }
            return;
        }
    }
};

CapturedTrace.prototype.parent = function() {
    return this._parent;
};

CapturedTrace.prototype.hasParent = function() {
    return this._parent !== undefined;
};

CapturedTrace.prototype.attachExtraTrace = function(error) {
    if (error.__stackCleaned__) return;
    this.uncycle();
    var parsed = CapturedTrace.parseStackAndMessage(error);
    var message = parsed.message;
    var stacks = [parsed.stack];

    var trace = this;
    while (trace !== undefined) {
        stacks.push(cleanStack(trace.stack.split("\n")));
        trace = trace._parent;
    }
    removeCommonRoots(stacks);
    removeDuplicateOrEmptyJumps(stacks);
    util.notEnumerableProp(error, "stack", reconstructStack(message, stacks));
    util.notEnumerableProp(error, "__stackCleaned__", true);
};

function reconstructStack(message, stacks) {
    for (var i = 0; i < stacks.length - 1; ++i) {
        stacks[i].push("From previous event:");
        stacks[i] = stacks[i].join("\n");
    }
    if (i < stacks.length) {
        stacks[i] = stacks[i].join("\n");
    }
    return message + "\n" + stacks.join("\n");
}

function removeDuplicateOrEmptyJumps(stacks) {
    for (var i = 0; i < stacks.length; ++i) {
        if (stacks[i].length === 0 ||
            ((i + 1 < stacks.length) && stacks[i][0] === stacks[i+1][0])) {
            stacks.splice(i, 1);
            i--;
        }
    }
}

function removeCommonRoots(stacks) {
    var current = stacks[0];
    for (var i = 1; i < stacks.length; ++i) {
        var prev = stacks[i];
        var currentLastIndex = current.length - 1;
        var currentLastLine = current[currentLastIndex];
        var commonRootMeetPoint = -1;

        for (var j = prev.length - 1; j >= 0; --j) {
            if (prev[j] === currentLastLine) {
                commonRootMeetPoint = j;
                break;
            }
        }

        for (var j = commonRootMeetPoint; j >= 0; --j) {
            var line = prev[j];
            if (current[currentLastIndex] === line) {
                current.pop();
                currentLastIndex--;
            } else {
                break;
            }
        }
        current = prev;
    }
}

function cleanStack(stack) {
    var ret = [];
    for (var i = 0; i < stack.length; ++i) {
        var line = stack[i];
        var isTraceLine = stackFramePattern.test(line) ||
            "    (No stack trace)" === line;
        var isInternalFrame = isTraceLine && shouldIgnore(line);
        if (isTraceLine && !isInternalFrame) {
            if (indentStackFrames && line.charAt(0) !== " ") {
                line = "    " + line;
            }
            ret.push(line);
        }
    }
    return ret;
}

function stackFramesAsArray(error) {
    var stack = error.stack.replace(/\s+$/g, "").split("\n");
    for (var i = 0; i < stack.length; ++i) {
        var line = stack[i];
        if ("    (No stack trace)" === line || stackFramePattern.test(line)) {
            break;
        }
    }
    if (i > 0) {
        stack = stack.slice(i);
    }
    return stack;
}

CapturedTrace.parseStackAndMessage = function(error) {
    var stack = error.stack;
    var message = error.toString();
    stack = typeof stack === "string" && stack.length > 0
                ? stackFramesAsArray(error) : ["    (No stack trace)"];
    return {
        message: message,
        stack: cleanStack(stack)
    };
};

CapturedTrace.formatAndLogError = function(error, title) {
    if (typeof console !== "undefined") {
        var message;
        if (typeof error === "object" || typeof error === "function") {
            var stack = error.stack;
            message = title + formatStack(stack, error);
        } else {
            message = title + String(error);
        }
        if (typeof warn === "function") {
            warn(message);
        } else if (typeof console.log === "function" ||
            typeof console.log === "object") {
            console.log(message);
        }
    }
};

CapturedTrace.unhandledRejection = function (reason) {
    CapturedTrace.formatAndLogError(reason, "^--- With additional stack trace: ");
};

CapturedTrace.isSupported = function () {
    return typeof captureStackTrace === "function";
};

CapturedTrace.fireRejectionEvent =
function(name, localHandler, reason, promise) {
    var localEventFired = false;
    try {
        if (typeof localHandler === "function") {
            localEventFired = true;
            if (name === "rejectionHandled") {
                localHandler(promise);
            } else {
                localHandler(reason, promise);
            }
        }
    } catch (e) {
        async.throwLater(e);
    }

    var globalEventFired = false;
    try {
        globalEventFired = fireGlobalEvent(name, reason, promise);
    } catch (e) {
        globalEventFired = true;
        async.throwLater(e);
    }

    var domEventFired = false;
    if (fireDomEvent) {
        try {
            domEventFired = fireDomEvent(name.toLowerCase(), {
                reason: reason,
                promise: promise
            });
        } catch (e) {
            domEventFired = true;
            async.throwLater(e);
        }
    }

    if (!globalEventFired && !localEventFired && !domEventFired &&
        name === "unhandledRejection") {
        CapturedTrace.formatAndLogError(reason, "Unhandled rejection ");
    }
};

function formatNonError(obj) {
    var str;
    if (typeof obj === "function") {
        str = "[function " +
            (obj.name || "anonymous") +
            "]";
    } else {
        str = obj.toString();
        var ruselessToString = /\[object [a-zA-Z0-9$_]+\]/;
        if (ruselessToString.test(str)) {
            try {
                var newStr = JSON.stringify(obj);
                str = newStr;
            }
            catch(e) {

            }
        }
        if (str.length === 0) {
            str = "(empty array)";
        }
    }
    return ("(<" + snip(str) + ">, no stack trace)");
}

function snip(str) {
    var maxChars = 41;
    if (str.length < maxChars) {
        return str;
    }
    return str.substr(0, maxChars - 3) + "...";
}

var shouldIgnore = function() { return false; };
var parseLineInfoRegex = /[\/<\(]([^:\/]+):(\d+):(?:\d+)\)?\s*$/;
function parseLineInfo(line) {
    var matches = line.match(parseLineInfoRegex);
    if (matches) {
        return {
            fileName: matches[1],
            line: parseInt(matches[2], 10)
        };
    }
}
CapturedTrace.setBounds = function(firstLineError, lastLineError) {
    if (!CapturedTrace.isSupported()) return;
    var firstStackLines = firstLineError.stack.split("\n");
    var lastStackLines = lastLineError.stack.split("\n");
    var firstIndex = -1;
    var lastIndex = -1;
    var firstFileName;
    var lastFileName;
    for (var i = 0; i < firstStackLines.length; ++i) {
        var result = parseLineInfo(firstStackLines[i]);
        if (result) {
            firstFileName = result.fileName;
            firstIndex = result.line;
            break;
        }
    }
    for (var i = 0; i < lastStackLines.length; ++i) {
        var result = parseLineInfo(lastStackLines[i]);
        if (result) {
            lastFileName = result.fileName;
            lastIndex = result.line;
            break;
        }
    }
    if (firstIndex < 0 || lastIndex < 0 || !firstFileName || !lastFileName ||
        firstFileName !== lastFileName || firstIndex >= lastIndex) {
        return;
    }

    shouldIgnore = function(line) {
        if (bluebirdFramePattern.test(line)) return true;
        var info = parseLineInfo(line);
        if (info) {
            if (info.fileName === firstFileName &&
                (firstIndex <= info.line && info.line <= lastIndex)) {
                return true;
            }
        }
        return false;
    };
};

var captureStackTrace = (function stackDetection() {
    var v8stackFramePattern = /^\s*at\s*/;
    var v8stackFormatter = function(stack, error) {
        if (typeof stack === "string") return stack;

        if (error.name !== undefined &&
            error.message !== undefined) {
            return error.toString();
        }
        return formatNonError(error);
    };

    if (typeof Error.stackTraceLimit === "number" &&
        typeof Error.captureStackTrace === "function") {
        Error.stackTraceLimit = Error.stackTraceLimit + 6;
        stackFramePattern = v8stackFramePattern;
        formatStack = v8stackFormatter;
        var captureStackTrace = Error.captureStackTrace;

        shouldIgnore = function(line) {
            return bluebirdFramePattern.test(line);
        };
        return function(receiver, ignoreUntil) {
            Error.stackTraceLimit = Error.stackTraceLimit + 6;
            captureStackTrace(receiver, ignoreUntil);
            Error.stackTraceLimit = Error.stackTraceLimit - 6;
        };
    }
    var err = new Error();

    if (typeof err.stack === "string" &&
        err.stack.split("\n")[0].indexOf("stackDetection@") >= 0) {
        stackFramePattern = /@/;
        formatStack = v8stackFormatter;
        indentStackFrames = true;
        return function captureStackTrace(o) {
            o.stack = new Error().stack;
        };
    }

    var hasStackAfterThrow;
    try { throw new Error(); }
    catch(e) {
        hasStackAfterThrow = ("stack" in e);
    }
    if (!("stack" in err) && hasStackAfterThrow) {
        stackFramePattern = v8stackFramePattern;
        formatStack = v8stackFormatter;
        return function captureStackTrace(o) {
            Error.stackTraceLimit = Error.stackTraceLimit + 6;
            try { throw new Error(); }
            catch(e) { o.stack = e.stack; }
            Error.stackTraceLimit = Error.stackTraceLimit - 6;
        };
    }

    formatStack = function(stack, error) {
        if (typeof stack === "string") return stack;

        if ((typeof error === "object" ||
            typeof error === "function") &&
            error.name !== undefined &&
            error.message !== undefined) {
            return error.toString();
        }
        return formatNonError(error);
    };

    return null;

})([]);

var fireDomEvent;
var fireGlobalEvent = (function() {
    if (util.isNode) {
        return function(name, reason, promise) {
            if (name === "rejectionHandled") {
                return process.emit(name, promise);
            } else {
                return process.emit(name, reason, promise);
            }
        };
    } else {
        var customEventWorks = false;
        var anyEventWorks = true;
        try {
            var ev = new self.CustomEvent("test");
            customEventWorks = ev instanceof CustomEvent;
        } catch (e) {}
        if (!customEventWorks) {
            try {
                var event = document.createEvent("CustomEvent");
                event.initCustomEvent("testingtheevent", false, true, {});
                self.dispatchEvent(event);
            } catch (e) {
                anyEventWorks = false;
            }
        }
        if (anyEventWorks) {
            fireDomEvent = function(type, detail) {
                var event;
                if (customEventWorks) {
                    event = new self.CustomEvent(type, {
                        detail: detail,
                        bubbles: false,
                        cancelable: true
                    });
                } else if (self.dispatchEvent) {
                    event = document.createEvent("CustomEvent");
                    event.initCustomEvent(type, false, true, detail);
                }

                return event ? !self.dispatchEvent(event) : false;
            };
        }

        var toWindowMethodNameMap = {};
        toWindowMethodNameMap["unhandledRejection"] = ("on" +
            "unhandledRejection").toLowerCase();
        toWindowMethodNameMap["rejectionHandled"] = ("on" +
            "rejectionHandled").toLowerCase();

        return function(name, reason, promise) {
            var methodName = toWindowMethodNameMap[name];
            var method = self[methodName];
            if (!method) return false;
            if (name === "rejectionHandled") {
                method.call(self, promise);
            } else {
                method.call(self, reason, promise);
            }
            return true;
        };
    }
})();

if (typeof console !== "undefined" && typeof console.warn !== "undefined") {
    warn = function (message) {
        console.warn(message);
    };
    if (util.isNode && process.stderr.isTTY) {
        warn = function(message) {
            process.stderr.write("\u001b[31m" + message + "\u001b[39m\n");
        };
    } else if (!util.isNode && typeof (new Error().stack) === "string") {
        warn = function(message) {
            console.warn("%c" + message, "color: red");
        };
    }
}

return CapturedTrace;
};

},{"./async.js":2,"./util.js":38}],8:[function(_dereq_,module,exports){
"use strict";
module.exports = function(NEXT_FILTER) {
var util = _dereq_("./util.js");
var errors = _dereq_("./errors.js");
var tryCatch = util.tryCatch;
var errorObj = util.errorObj;
var keys = _dereq_("./es5.js").keys;
var TypeError = errors.TypeError;

function CatchFilter(instances, callback, promise) {
    this._instances = instances;
    this._callback = callback;
    this._promise = promise;
}

function safePredicate(predicate, e) {
    var safeObject = {};
    var retfilter = tryCatch(predicate).call(safeObject, e);

    if (retfilter === errorObj) return retfilter;

    var safeKeys = keys(safeObject);
    if (safeKeys.length) {
        errorObj.e = new TypeError("Catch filter must inherit from Error or be a simple predicate function\u000a\u000a    See http://goo.gl/o84o68\u000a");
        return errorObj;
    }
    return retfilter;
}

CatchFilter.prototype.doFilter = function (e) {
    var cb = this._callback;
    var promise = this._promise;
    var boundTo = promise._boundTo;
    for (var i = 0, len = this._instances.length; i < len; ++i) {
        var item = this._instances[i];
        var itemIsErrorType = item === Error ||
            (item != null && item.prototype instanceof Error);

        if (itemIsErrorType && e instanceof item) {
            var ret = tryCatch(cb).call(boundTo, e);
            if (ret === errorObj) {
                NEXT_FILTER.e = ret.e;
                return NEXT_FILTER;
            }
            return ret;
        } else if (typeof item === "function" && !itemIsErrorType) {
            var shouldHandle = safePredicate(item, e);
            if (shouldHandle === errorObj) {
                e = errorObj.e;
                break;
            } else if (shouldHandle) {
                var ret = tryCatch(cb).call(boundTo, e);
                if (ret === errorObj) {
                    NEXT_FILTER.e = ret.e;
                    return NEXT_FILTER;
                }
                return ret;
            }
        }
    }
    NEXT_FILTER.e = e;
    return NEXT_FILTER;
};

return CatchFilter;
};

},{"./errors.js":13,"./es5.js":14,"./util.js":38}],9:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, CapturedTrace, isDebugging) {
var contextStack = [];
function Context() {
    this._trace = new CapturedTrace(peekContext());
}
Context.prototype._pushContext = function () {
    if (!isDebugging()) return;
    if (this._trace !== undefined) {
        contextStack.push(this._trace);
    }
};

Context.prototype._popContext = function () {
    if (!isDebugging()) return;
    if (this._trace !== undefined) {
        contextStack.pop();
    }
};

function createContext() {
    if (isDebugging()) return new Context();
}

function peekContext() {
    var lastIndex = contextStack.length - 1;
    if (lastIndex >= 0) {
        return contextStack[lastIndex];
    }
    return undefined;
}

Promise.prototype._peekContext = peekContext;
Promise.prototype._pushContext = Context.prototype._pushContext;
Promise.prototype._popContext = Context.prototype._popContext;

return createContext;
};

},{}],10:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, CapturedTrace) {
var async = _dereq_("./async.js");
var Warning = _dereq_("./errors.js").Warning;
var util = _dereq_("./util.js");
var canAttachTrace = util.canAttachTrace;
var unhandledRejectionHandled;
var possiblyUnhandledRejection;
var debugging = false || (util.isNode &&
                    (!!process.env["BLUEBIRD_DEBUG"] ||
                     process.env["NODE_ENV"] === "development"));

if (debugging) {
    async.disableTrampolineIfNecessary();
}

Promise.prototype._ensurePossibleRejectionHandled = function () {
    this._setRejectionIsUnhandled();
    async.invokeLater(this._notifyUnhandledRejection, this, undefined);
};

Promise.prototype._notifyUnhandledRejectionIsHandled = function () {
    CapturedTrace.fireRejectionEvent("rejectionHandled",
                                  unhandledRejectionHandled, undefined, this);
};

Promise.prototype._notifyUnhandledRejection = function () {
    if (this._isRejectionUnhandled()) {
        var reason = this._getCarriedStackTrace() || this._settledValue;
        this._setUnhandledRejectionIsNotified();
        CapturedTrace.fireRejectionEvent("unhandledRejection",
                                      possiblyUnhandledRejection, reason, this);
    }
};

Promise.prototype._setUnhandledRejectionIsNotified = function () {
    this._bitField = this._bitField | 524288;
};

Promise.prototype._unsetUnhandledRejectionIsNotified = function () {
    this._bitField = this._bitField & (~524288);
};

Promise.prototype._isUnhandledRejectionNotified = function () {
    return (this._bitField & 524288) > 0;
};

Promise.prototype._setRejectionIsUnhandled = function () {
    this._bitField = this._bitField | 2097152;
};

Promise.prototype._unsetRejectionIsUnhandled = function () {
    this._bitField = this._bitField & (~2097152);
    if (this._isUnhandledRejectionNotified()) {
        this._unsetUnhandledRejectionIsNotified();
        this._notifyUnhandledRejectionIsHandled();
    }
};

Promise.prototype._isRejectionUnhandled = function () {
    return (this._bitField & 2097152) > 0;
};

Promise.prototype._setCarriedStackTrace = function (capturedTrace) {
    this._bitField = this._bitField | 1048576;
    this._fulfillmentHandler0 = capturedTrace;
};

Promise.prototype._isCarryingStackTrace = function () {
    return (this._bitField & 1048576) > 0;
};

Promise.prototype._getCarriedStackTrace = function () {
    return this._isCarryingStackTrace()
        ? this._fulfillmentHandler0
        : undefined;
};

Promise.prototype._captureStackTrace = function () {
    if (debugging) {
        this._trace = new CapturedTrace(this._peekContext());
    }
    return this;
};

Promise.prototype._attachExtraTrace = function (error, ignoreSelf) {
    if (debugging && canAttachTrace(error)) {
        var trace = this._trace;
        if (trace !== undefined) {
            if (ignoreSelf) trace = trace._parent;
        }
        if (trace !== undefined) {
            trace.attachExtraTrace(error);
        } else if (!error.__stackCleaned__) {
            var parsed = CapturedTrace.parseStackAndMessage(error);
            util.notEnumerableProp(error, "stack",
                parsed.message + "\n" + parsed.stack.join("\n"));
            util.notEnumerableProp(error, "__stackCleaned__", true);
        }
    }
};

Promise.prototype._warn = function(message) {
    var warning = new Warning(message);
    var ctx = this._peekContext();
    if (ctx) {
        ctx.attachExtraTrace(warning);
    } else {
        var parsed = CapturedTrace.parseStackAndMessage(warning);
        warning.stack = parsed.message + "\n" + parsed.stack.join("\n");
    }
    CapturedTrace.formatAndLogError(warning, "");
};

Promise.onPossiblyUnhandledRejection = function (fn) {
    possiblyUnhandledRejection = typeof fn === "function" ? fn : undefined;
};

Promise.onUnhandledRejectionHandled = function (fn) {
    unhandledRejectionHandled = typeof fn === "function" ? fn : undefined;
};

Promise.longStackTraces = function () {
    if (async.haveItemsQueued() &&
        debugging === false
   ) {
        throw new Error("cannot enable long stack traces after promises have been created\u000a\u000a    See http://goo.gl/DT1qyG\u000a");
    }
    debugging = CapturedTrace.isSupported();
    if (debugging) {
        async.disableTrampolineIfNecessary();
    }
};

Promise.hasLongStackTraces = function () {
    return debugging && CapturedTrace.isSupported();
};

if (!CapturedTrace.isSupported()) {
    Promise.longStackTraces = function(){};
    debugging = false;
}

return function() {
    return debugging;
};
};

},{"./async.js":2,"./errors.js":13,"./util.js":38}],11:[function(_dereq_,module,exports){
"use strict";
var util = _dereq_("./util.js");
var isPrimitive = util.isPrimitive;
var wrapsPrimitiveReceiver = util.wrapsPrimitiveReceiver;

module.exports = function(Promise) {
var returner = function () {
    return this;
};
var thrower = function () {
    throw this;
};

var wrapper = function (value, action) {
    if (action === 1) {
        return function () {
            throw value;
        };
    } else if (action === 2) {
        return function () {
            return value;
        };
    }
};


Promise.prototype["return"] =
Promise.prototype.thenReturn = function (value) {
    if (wrapsPrimitiveReceiver && isPrimitive(value)) {
        return this._then(
            wrapper(value, 2),
            undefined,
            undefined,
            undefined,
            undefined
       );
    }
    return this._then(returner, undefined, undefined, value, undefined);
};

Promise.prototype["throw"] =
Promise.prototype.thenThrow = function (reason) {
    if (wrapsPrimitiveReceiver && isPrimitive(reason)) {
        return this._then(
            wrapper(reason, 1),
            undefined,
            undefined,
            undefined,
            undefined
       );
    }
    return this._then(thrower, undefined, undefined, reason, undefined);
};
};

},{"./util.js":38}],12:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, INTERNAL) {
var PromiseReduce = Promise.reduce;

Promise.prototype.each = function (fn) {
    return PromiseReduce(this, fn, null, INTERNAL);
};

Promise.each = function (promises, fn) {
    return PromiseReduce(promises, fn, null, INTERNAL);
};
};

},{}],13:[function(_dereq_,module,exports){
"use strict";
var es5 = _dereq_("./es5.js");
var Objectfreeze = es5.freeze;
var util = _dereq_("./util.js");
var inherits = util.inherits;
var notEnumerableProp = util.notEnumerableProp;

function subError(nameProperty, defaultMessage) {
    function SubError(message) {
        if (!(this instanceof SubError)) return new SubError(message);
        notEnumerableProp(this, "message",
            typeof message === "string" ? message : defaultMessage);
        notEnumerableProp(this, "name", nameProperty);
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        } else {
            Error.call(this);
        }
    }
    inherits(SubError, Error);
    return SubError;
}

var _TypeError, _RangeError;
var Warning = subError("Warning", "warning");
var CancellationError = subError("CancellationError", "cancellation error");
var TimeoutError = subError("TimeoutError", "timeout error");
var AggregateError = subError("AggregateError", "aggregate error");
try {
    _TypeError = TypeError;
    _RangeError = RangeError;
} catch(e) {
    _TypeError = subError("TypeError", "type error");
    _RangeError = subError("RangeError", "range error");
}

var methods = ("join pop push shift unshift slice filter forEach some " +
    "every map indexOf lastIndexOf reduce reduceRight sort reverse").split(" ");

for (var i = 0; i < methods.length; ++i) {
    if (typeof Array.prototype[methods[i]] === "function") {
        AggregateError.prototype[methods[i]] = Array.prototype[methods[i]];
    }
}

es5.defineProperty(AggregateError.prototype, "length", {
    value: 0,
    configurable: false,
    writable: true,
    enumerable: true
});
AggregateError.prototype["isOperational"] = true;
var level = 0;
AggregateError.prototype.toString = function() {
    var indent = Array(level * 4 + 1).join(" ");
    var ret = "\n" + indent + "AggregateError of:" + "\n";
    level++;
    indent = Array(level * 4 + 1).join(" ");
    for (var i = 0; i < this.length; ++i) {
        var str = this[i] === this ? "[Circular AggregateError]" : this[i] + "";
        var lines = str.split("\n");
        for (var j = 0; j < lines.length; ++j) {
            lines[j] = indent + lines[j];
        }
        str = lines.join("\n");
        ret += str + "\n";
    }
    level--;
    return ret;
};

function OperationalError(message) {
    if (!(this instanceof OperationalError))
        return new OperationalError(message);
    notEnumerableProp(this, "name", "OperationalError");
    notEnumerableProp(this, "message", message);
    this.cause = message;
    this["isOperational"] = true;

    if (message instanceof Error) {
        notEnumerableProp(this, "message", message.message);
        notEnumerableProp(this, "stack", message.stack);
    } else if (Error.captureStackTrace) {
        Error.captureStackTrace(this, this.constructor);
    }

}
inherits(OperationalError, Error);

var errorTypes = Error["__BluebirdErrorTypes__"];
if (!errorTypes) {
    errorTypes = Objectfreeze({
        CancellationError: CancellationError,
        TimeoutError: TimeoutError,
        OperationalError: OperationalError,
        RejectionError: OperationalError,
        AggregateError: AggregateError
    });
    notEnumerableProp(Error, "__BluebirdErrorTypes__", errorTypes);
}

module.exports = {
    Error: Error,
    TypeError: _TypeError,
    RangeError: _RangeError,
    CancellationError: errorTypes.CancellationError,
    OperationalError: errorTypes.OperationalError,
    TimeoutError: errorTypes.TimeoutError,
    AggregateError: errorTypes.AggregateError,
    Warning: Warning
};

},{"./es5.js":14,"./util.js":38}],14:[function(_dereq_,module,exports){
var isES5 = (function(){
    "use strict";
    return this === undefined;
})();

if (isES5) {
    module.exports = {
        freeze: Object.freeze,
        defineProperty: Object.defineProperty,
        getDescriptor: Object.getOwnPropertyDescriptor,
        keys: Object.keys,
        names: Object.getOwnPropertyNames,
        getPrototypeOf: Object.getPrototypeOf,
        isArray: Array.isArray,
        isES5: isES5,
        propertyIsWritable: function(obj, prop) {
            var descriptor = Object.getOwnPropertyDescriptor(obj, prop);
            return !!(!descriptor || descriptor.writable || descriptor.set);
        }
    };
} else {
    var has = {}.hasOwnProperty;
    var str = {}.toString;
    var proto = {}.constructor.prototype;

    var ObjectKeys = function (o) {
        var ret = [];
        for (var key in o) {
            if (has.call(o, key)) {
                ret.push(key);
            }
        }
        return ret;
    };

    var ObjectGetDescriptor = function(o, key) {
        return {value: o[key]};
    };

    var ObjectDefineProperty = function (o, key, desc) {
        o[key] = desc.value;
        return o;
    };

    var ObjectFreeze = function (obj) {
        return obj;
    };

    var ObjectGetPrototypeOf = function (obj) {
        try {
            return Object(obj).constructor.prototype;
        }
        catch (e) {
            return proto;
        }
    };

    var ArrayIsArray = function (obj) {
        try {
            return str.call(obj) === "[object Array]";
        }
        catch(e) {
            return false;
        }
    };

    module.exports = {
        isArray: ArrayIsArray,
        keys: ObjectKeys,
        names: ObjectKeys,
        defineProperty: ObjectDefineProperty,
        getDescriptor: ObjectGetDescriptor,
        freeze: ObjectFreeze,
        getPrototypeOf: ObjectGetPrototypeOf,
        isES5: isES5,
        propertyIsWritable: function() {
            return true;
        }
    };
}

},{}],15:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, INTERNAL) {
var PromiseMap = Promise.map;

Promise.prototype.filter = function (fn, options) {
    return PromiseMap(this, fn, options, INTERNAL);
};

Promise.filter = function (promises, fn, options) {
    return PromiseMap(promises, fn, options, INTERNAL);
};
};

},{}],16:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, NEXT_FILTER, tryConvertToPromise) {
var util = _dereq_("./util.js");
var wrapsPrimitiveReceiver = util.wrapsPrimitiveReceiver;
var isPrimitive = util.isPrimitive;
var thrower = util.thrower;

function returnThis() {
    return this;
}
function throwThis() {
    throw this;
}
function return$(r) {
    return function() {
        return r;
    };
}
function throw$(r) {
    return function() {
        throw r;
    };
}
function promisedFinally(ret, reasonOrValue, isFulfilled) {
    var then;
    if (wrapsPrimitiveReceiver && isPrimitive(reasonOrValue)) {
        then = isFulfilled ? return$(reasonOrValue) : throw$(reasonOrValue);
    } else {
        then = isFulfilled ? returnThis : throwThis;
    }
    return ret._then(then, thrower, undefined, reasonOrValue, undefined);
}

function finallyHandler(reasonOrValue) {
    var promise = this.promise;
    var handler = this.handler;

    var ret = promise._isBound()
                    ? handler.call(promise._boundTo)
                    : handler();

    if (ret !== undefined) {
        var maybePromise = tryConvertToPromise(ret, promise);
        if (maybePromise instanceof Promise) {
            maybePromise = maybePromise._target();
            return promisedFinally(maybePromise, reasonOrValue,
                                    promise.isFulfilled());
        }
    }

    if (promise.isRejected()) {
        NEXT_FILTER.e = reasonOrValue;
        return NEXT_FILTER;
    } else {
        return reasonOrValue;
    }
}

function tapHandler(value) {
    var promise = this.promise;
    var handler = this.handler;

    var ret = promise._isBound()
                    ? handler.call(promise._boundTo, value)
                    : handler(value);

    if (ret !== undefined) {
        var maybePromise = tryConvertToPromise(ret, promise);
        if (maybePromise instanceof Promise) {
            maybePromise = maybePromise._target();
            return promisedFinally(maybePromise, value, true);
        }
    }
    return value;
}

Promise.prototype._passThroughHandler = function (handler, isFinally) {
    if (typeof handler !== "function") return this.then();

    var promiseAndHandler = {
        promise: this,
        handler: handler
    };

    return this._then(
            isFinally ? finallyHandler : tapHandler,
            isFinally ? finallyHandler : undefined, undefined,
            promiseAndHandler, undefined);
};

Promise.prototype.lastly =
Promise.prototype["finally"] = function (handler) {
    return this._passThroughHandler(handler, true);
};

Promise.prototype.tap = function (handler) {
    return this._passThroughHandler(handler, false);
};
};

},{"./util.js":38}],17:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise,
                          apiRejection,
                          INTERNAL,
                          tryConvertToPromise) {
var errors = _dereq_("./errors.js");
var TypeError = errors.TypeError;
var util = _dereq_("./util.js");
var errorObj = util.errorObj;
var tryCatch = util.tryCatch;
var yieldHandlers = [];

function promiseFromYieldHandler(value, yieldHandlers, traceParent) {
    for (var i = 0; i < yieldHandlers.length; ++i) {
        traceParent._pushContext();
        var result = tryCatch(yieldHandlers[i])(value);
        traceParent._popContext();
        if (result === errorObj) {
            traceParent._pushContext();
            var ret = Promise.reject(errorObj.e);
            traceParent._popContext();
            return ret;
        }
        var maybePromise = tryConvertToPromise(result, traceParent);
        if (maybePromise instanceof Promise) return maybePromise;
    }
    return null;
}

function PromiseSpawn(generatorFunction, receiver, yieldHandler, stack) {
    var promise = this._promise = new Promise(INTERNAL);
    promise._captureStackTrace();
    this._stack = stack;
    this._generatorFunction = generatorFunction;
    this._receiver = receiver;
    this._generator = undefined;
    this._yieldHandlers = typeof yieldHandler === "function"
        ? [yieldHandler].concat(yieldHandlers)
        : yieldHandlers;
}

PromiseSpawn.prototype.promise = function () {
    return this._promise;
};

PromiseSpawn.prototype._run = function () {
    this._generator = this._generatorFunction.call(this._receiver);
    this._receiver =
        this._generatorFunction = undefined;
    this._next(undefined);
};

PromiseSpawn.prototype._continue = function (result) {
    if (result === errorObj) {
        return this._promise._rejectCallback(result.e, false, true);
    }

    var value = result.value;
    if (result.done === true) {
        this._promise._resolveCallback(value);
    } else {
        var maybePromise = tryConvertToPromise(value, this._promise);
        if (!(maybePromise instanceof Promise)) {
            maybePromise =
                promiseFromYieldHandler(maybePromise,
                                        this._yieldHandlers,
                                        this._promise);
            if (maybePromise === null) {
                this._throw(
                    new TypeError(
                        "A value %s was yielded that could not be treated as a promise\u000a\u000a    See http://goo.gl/4Y4pDk\u000a\u000a".replace("%s", value) +
                        "From coroutine:\u000a" +
                        this._stack.split("\n").slice(1, -7).join("\n")
                    )
                );
                return;
            }
        }
        maybePromise._then(
            this._next,
            this._throw,
            undefined,
            this,
            null
       );
    }
};

PromiseSpawn.prototype._throw = function (reason) {
    this._promise._attachExtraTrace(reason);
    this._promise._pushContext();
    var result = tryCatch(this._generator["throw"])
        .call(this._generator, reason);
    this._promise._popContext();
    this._continue(result);
};

PromiseSpawn.prototype._next = function (value) {
    this._promise._pushContext();
    var result = tryCatch(this._generator.next).call(this._generator, value);
    this._promise._popContext();
    this._continue(result);
};

Promise.coroutine = function (generatorFunction, options) {
    if (typeof generatorFunction !== "function") {
        throw new TypeError("generatorFunction must be a function\u000a\u000a    See http://goo.gl/6Vqhm0\u000a");
    }
    var yieldHandler = Object(options).yieldHandler;
    var PromiseSpawn$ = PromiseSpawn;
    var stack = new Error().stack;
    return function () {
        var generator = generatorFunction.apply(this, arguments);
        var spawn = new PromiseSpawn$(undefined, undefined, yieldHandler,
                                      stack);
        spawn._generator = generator;
        spawn._next(undefined);
        return spawn.promise();
    };
};

Promise.coroutine.addYieldHandler = function(fn) {
    if (typeof fn !== "function") throw new TypeError("fn must be a function\u000a\u000a    See http://goo.gl/916lJJ\u000a");
    yieldHandlers.push(fn);
};

Promise.spawn = function (generatorFunction) {
    if (typeof generatorFunction !== "function") {
        return apiRejection("generatorFunction must be a function\u000a\u000a    See http://goo.gl/6Vqhm0\u000a");
    }
    var spawn = new PromiseSpawn(generatorFunction, this);
    var ret = spawn.promise();
    spawn._run(Promise.spawn);
    return ret;
};
};

},{"./errors.js":13,"./util.js":38}],18:[function(_dereq_,module,exports){
"use strict";
module.exports =
function(Promise, PromiseArray, tryConvertToPromise, INTERNAL) {
var util = _dereq_("./util.js");
var canEvaluate = util.canEvaluate;
var tryCatch = util.tryCatch;
var errorObj = util.errorObj;
var reject;

if (!true) {
if (canEvaluate) {
    var thenCallback = function(i) {
        return new Function("value", "holder", "                             \n\
            'use strict';                                                    \n\
            holder.pIndex = value;                                           \n\
            holder.checkFulfillment(this);                                   \n\
            ".replace(/Index/g, i));
    };

    var caller = function(count) {
        var values = [];
        for (var i = 1; i <= count; ++i) values.push("holder.p" + i);
        return new Function("holder", "                                      \n\
            'use strict';                                                    \n\
            var callback = holder.fn;                                        \n\
            return callback(values);                                         \n\
            ".replace(/values/g, values.join(", ")));
    };
    var thenCallbacks = [];
    var callers = [undefined];
    for (var i = 1; i <= 5; ++i) {
        thenCallbacks.push(thenCallback(i));
        callers.push(caller(i));
    }

    var Holder = function(total, fn) {
        this.p1 = this.p2 = this.p3 = this.p4 = this.p5 = null;
        this.fn = fn;
        this.total = total;
        this.now = 0;
    };

    Holder.prototype.callers = callers;
    Holder.prototype.checkFulfillment = function(promise) {
        var now = this.now;
        now++;
        var total = this.total;
        if (now >= total) {
            var handler = this.callers[total];
            promise._pushContext();
            var ret = tryCatch(handler)(this);
            promise._popContext();
            if (ret === errorObj) {
                promise._rejectCallback(ret.e, false, true);
            } else {
                promise._resolveCallback(ret);
            }
        } else {
            this.now = now;
        }
    };

    var reject = function (reason) {
        this._reject(reason);
    };
}
}

Promise.join = function () {
    var last = arguments.length - 1;
    var fn;
    if (last > 0 && typeof arguments[last] === "function") {
        fn = arguments[last];
        if (!true) {
            if (last < 6 && canEvaluate) {
                var ret = new Promise(INTERNAL);
                ret._captureStackTrace();
                var holder = new Holder(last, fn);
                var callbacks = thenCallbacks;
                for (var i = 0; i < last; ++i) {
                    var maybePromise = tryConvertToPromise(arguments[i], ret);
                    if (maybePromise instanceof Promise) {
                        maybePromise = maybePromise._target();
                        if (maybePromise._isPending()) {
                            maybePromise._then(callbacks[i], reject,
                                               undefined, ret, holder);
                        } else if (maybePromise._isFulfilled()) {
                            callbacks[i].call(ret,
                                              maybePromise._value(), holder);
                        } else {
                            ret._reject(maybePromise._reason());
                        }
                    } else {
                        callbacks[i].call(ret, maybePromise, holder);
                    }
                }
                return ret;
            }
        }
    }
    var $_len = arguments.length;var args = new Array($_len); for(var $_i = 0; $_i < $_len; ++$_i) {args[$_i] = arguments[$_i];}
    if (fn) args.pop();
    var ret = new PromiseArray(args).promise();
    return fn !== undefined ? ret.spread(fn) : ret;
};

};

},{"./util.js":38}],19:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise,
                          PromiseArray,
                          apiRejection,
                          tryConvertToPromise,
                          INTERNAL) {
var async = _dereq_("./async.js");
var util = _dereq_("./util.js");
var tryCatch = util.tryCatch;
var errorObj = util.errorObj;
var PENDING = {};
var EMPTY_ARRAY = [];

function MappingPromiseArray(promises, fn, limit, _filter) {
    this.constructor$(promises);
    this._promise._captureStackTrace();
    this._callback = fn;
    this._preservedValues = _filter === INTERNAL
        ? new Array(this.length())
        : null;
    this._limit = limit;
    this._inFlight = 0;
    this._queue = limit >= 1 ? [] : EMPTY_ARRAY;
    async.invoke(init, this, undefined);
}
util.inherits(MappingPromiseArray, PromiseArray);
function init() {this._init$(undefined, -2);}

MappingPromiseArray.prototype._init = function () {};

MappingPromiseArray.prototype._promiseFulfilled = function (value, index) {
    var values = this._values;
    var length = this.length();
    var preservedValues = this._preservedValues;
    var limit = this._limit;
    if (values[index] === PENDING) {
        values[index] = value;
        if (limit >= 1) {
            this._inFlight--;
            this._drainQueue();
            if (this._isResolved()) return;
        }
    } else {
        if (limit >= 1 && this._inFlight >= limit) {
            values[index] = value;
            this._queue.push(index);
            return;
        }
        if (preservedValues !== null) preservedValues[index] = value;

        var callback = this._callback;
        var receiver = this._promise._boundTo;
        this._promise._pushContext();
        var ret = tryCatch(callback).call(receiver, value, index, length);
        this._promise._popContext();
        if (ret === errorObj) return this._reject(ret.e);

        var maybePromise = tryConvertToPromise(ret, this._promise);
        if (maybePromise instanceof Promise) {
            maybePromise = maybePromise._target();
            if (maybePromise._isPending()) {
                if (limit >= 1) this._inFlight++;
                values[index] = PENDING;
                return maybePromise._proxyPromiseArray(this, index);
            } else if (maybePromise._isFulfilled()) {
                ret = maybePromise._value();
            } else {
                return this._reject(maybePromise._reason());
            }
        }
        values[index] = ret;
    }
    var totalResolved = ++this._totalResolved;
    if (totalResolved >= length) {
        if (preservedValues !== null) {
            this._filter(values, preservedValues);
        } else {
            this._resolve(values);
        }

    }
};

MappingPromiseArray.prototype._drainQueue = function () {
    var queue = this._queue;
    var limit = this._limit;
    var values = this._values;
    while (queue.length > 0 && this._inFlight < limit) {
        if (this._isResolved()) return;
        var index = queue.pop();
        this._promiseFulfilled(values[index], index);
    }
};

MappingPromiseArray.prototype._filter = function (booleans, values) {
    var len = values.length;
    var ret = new Array(len);
    var j = 0;
    for (var i = 0; i < len; ++i) {
        if (booleans[i]) ret[j++] = values[i];
    }
    ret.length = j;
    this._resolve(ret);
};

MappingPromiseArray.prototype.preservedValues = function () {
    return this._preservedValues;
};

function map(promises, fn, options, _filter) {
    var limit = typeof options === "object" && options !== null
        ? options.concurrency
        : 0;
    limit = typeof limit === "number" &&
        isFinite(limit) && limit >= 1 ? limit : 0;
    return new MappingPromiseArray(promises, fn, limit, _filter);
}

Promise.prototype.map = function (fn, options) {
    if (typeof fn !== "function") return apiRejection("fn must be a function\u000a\u000a    See http://goo.gl/916lJJ\u000a");

    return map(this, fn, options, null).promise();
};

Promise.map = function (promises, fn, options, _filter) {
    if (typeof fn !== "function") return apiRejection("fn must be a function\u000a\u000a    See http://goo.gl/916lJJ\u000a");
    return map(promises, fn, options, _filter).promise();
};


};

},{"./async.js":2,"./util.js":38}],20:[function(_dereq_,module,exports){
"use strict";
module.exports =
function(Promise, INTERNAL, tryConvertToPromise, apiRejection) {
var util = _dereq_("./util.js");
var tryCatch = util.tryCatch;

Promise.method = function (fn) {
    if (typeof fn !== "function") {
        throw new Promise.TypeError("fn must be a function\u000a\u000a    See http://goo.gl/916lJJ\u000a");
    }
    return function () {
        var ret = new Promise(INTERNAL);
        ret._captureStackTrace();
        ret._pushContext();
        var value = tryCatch(fn).apply(this, arguments);
        ret._popContext();
        ret._resolveFromSyncValue(value);
        return ret;
    };
};

Promise.attempt = Promise["try"] = function (fn, args, ctx) {
    if (typeof fn !== "function") {
        return apiRejection("fn must be a function\u000a\u000a    See http://goo.gl/916lJJ\u000a");
    }
    var ret = new Promise(INTERNAL);
    ret._captureStackTrace();
    ret._pushContext();
    var value = util.isArray(args)
        ? tryCatch(fn).apply(ctx, args)
        : tryCatch(fn).call(ctx, args);
    ret._popContext();
    ret._resolveFromSyncValue(value);
    return ret;
};

Promise.prototype._resolveFromSyncValue = function (value) {
    if (value === util.errorObj) {
        this._rejectCallback(value.e, false, true);
    } else {
        this._resolveCallback(value, true);
    }
};
};

},{"./util.js":38}],21:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise) {
var util = _dereq_("./util.js");
var async = _dereq_("./async.js");
var tryCatch = util.tryCatch;
var errorObj = util.errorObj;

function spreadAdapter(val, nodeback) {
    var promise = this;
    if (!util.isArray(val)) return successAdapter.call(promise, val, nodeback);
    var ret = tryCatch(nodeback).apply(promise._boundTo, [null].concat(val));
    if (ret === errorObj) {
        async.throwLater(ret.e);
    }
}

function successAdapter(val, nodeback) {
    var promise = this;
    var receiver = promise._boundTo;
    var ret = val === undefined
        ? tryCatch(nodeback).call(receiver, null)
        : tryCatch(nodeback).call(receiver, null, val);
    if (ret === errorObj) {
        async.throwLater(ret.e);
    }
}
function errorAdapter(reason, nodeback) {
    var promise = this;
    if (!reason) {
        var target = promise._target();
        var newReason = target._getCarriedStackTrace();
        newReason.cause = reason;
        reason = newReason;
    }
    var ret = tryCatch(nodeback).call(promise._boundTo, reason);
    if (ret === errorObj) {
        async.throwLater(ret.e);
    }
}

Promise.prototype.asCallback = 
Promise.prototype.nodeify = function (nodeback, options) {
    if (typeof nodeback == "function") {
        var adapter = successAdapter;
        if (options !== undefined && Object(options).spread) {
            adapter = spreadAdapter;
        }
        this._then(
            adapter,
            errorAdapter,
            undefined,
            this,
            nodeback
        );
    }
    return this;
};
};

},{"./async.js":2,"./util.js":38}],22:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, PromiseArray) {
var util = _dereq_("./util.js");
var async = _dereq_("./async.js");
var tryCatch = util.tryCatch;
var errorObj = util.errorObj;

Promise.prototype.progressed = function (handler) {
    return this._then(undefined, undefined, handler, undefined, undefined);
};

Promise.prototype._progress = function (progressValue) {
    if (this._isFollowingOrFulfilledOrRejected()) return;
    this._target()._progressUnchecked(progressValue);

};

Promise.prototype._progressHandlerAt = function (index) {
    return index === 0
        ? this._progressHandler0
        : this[(index << 2) + index - 5 + 2];
};

Promise.prototype._doProgressWith = function (progression) {
    var progressValue = progression.value;
    var handler = progression.handler;
    var promise = progression.promise;
    var receiver = progression.receiver;

    var ret = tryCatch(handler).call(receiver, progressValue);
    if (ret === errorObj) {
        if (ret.e != null &&
            ret.e.name !== "StopProgressPropagation") {
            var trace = util.canAttachTrace(ret.e)
                ? ret.e : new Error(util.toString(ret.e));
            promise._attachExtraTrace(trace);
            promise._progress(ret.e);
        }
    } else if (ret instanceof Promise) {
        ret._then(promise._progress, null, null, promise, undefined);
    } else {
        promise._progress(ret);
    }
};


Promise.prototype._progressUnchecked = function (progressValue) {
    var len = this._length();
    var progress = this._progress;
    for (var i = 0; i < len; i++) {
        var handler = this._progressHandlerAt(i);
        var promise = this._promiseAt(i);
        if (!(promise instanceof Promise)) {
            var receiver = this._receiverAt(i);
            if (typeof handler === "function") {
                handler.call(receiver, progressValue, promise);
            } else if (receiver instanceof PromiseArray &&
                       !receiver._isResolved()) {
                receiver._promiseProgressed(progressValue, promise);
            }
            continue;
        }

        if (typeof handler === "function") {
            async.invoke(this._doProgressWith, this, {
                handler: handler,
                promise: promise,
                receiver: this._receiverAt(i),
                value: progressValue
            });
        } else {
            async.invoke(progress, promise, progressValue);
        }
    }
};
};

},{"./async.js":2,"./util.js":38}],23:[function(_dereq_,module,exports){
"use strict";
module.exports = function() {
var makeSelfResolutionError = function () {
    return new TypeError("circular promise resolution chain\u000a\u000a    See http://goo.gl/LhFpo0\u000a");
};
var reflect = function() {
    return new Promise.PromiseInspection(this._target());
};
var apiRejection = function(msg) {
    return Promise.reject(new TypeError(msg));
};
var util = _dereq_("./util.js");
var async = _dereq_("./async.js");
var errors = _dereq_("./errors.js");
var TypeError = Promise.TypeError = errors.TypeError;
Promise.RangeError = errors.RangeError;
Promise.CancellationError = errors.CancellationError;
Promise.TimeoutError = errors.TimeoutError;
Promise.OperationalError = errors.OperationalError;
Promise.RejectionError = errors.OperationalError;
Promise.AggregateError = errors.AggregateError;
var INTERNAL = function(){};
var APPLY = {};
var NEXT_FILTER = {e: null};
var tryConvertToPromise = _dereq_("./thenables.js")(Promise, INTERNAL);
var PromiseArray =
    _dereq_("./promise_array.js")(Promise, INTERNAL,
                                    tryConvertToPromise, apiRejection);
var CapturedTrace = _dereq_("./captured_trace.js")();
var isDebugging = _dereq_("./debuggability.js")(Promise, CapturedTrace);
 /*jshint unused:false*/
var createContext =
    _dereq_("./context.js")(Promise, CapturedTrace, isDebugging);
var CatchFilter = _dereq_("./catch_filter.js")(NEXT_FILTER);
var PromiseResolver = _dereq_("./promise_resolver.js");
var nodebackForPromise = PromiseResolver._nodebackForPromise;
var errorObj = util.errorObj;
var tryCatch = util.tryCatch;
function Promise(resolver) {
    if (typeof resolver !== "function") {
        throw new TypeError("the promise constructor requires a resolver function\u000a\u000a    See http://goo.gl/EC22Yn\u000a");
    }
    if (this.constructor !== Promise) {
        throw new TypeError("the promise constructor cannot be invoked directly\u000a\u000a    See http://goo.gl/KsIlge\u000a");
    }
    this._bitField = 0;
    this._fulfillmentHandler0 = undefined;
    this._rejectionHandler0 = undefined;
    this._progressHandler0 = undefined;
    this._promise0 = undefined;
    this._receiver0 = undefined;
    this._settledValue = undefined;
    if (resolver !== INTERNAL) this._resolveFromResolver(resolver);
}

Promise.prototype.toString = function () {
    return "[object Promise]";
};

Promise.prototype.caught = Promise.prototype["catch"] = function (fn) {
    var len = arguments.length;
    if (len > 1) {
        var catchInstances = new Array(len - 1),
            j = 0, i;
        for (i = 0; i < len - 1; ++i) {
            var item = arguments[i];
            if (typeof item === "function") {
                catchInstances[j++] = item;
            } else {
                return Promise.reject(
                    new TypeError("Catch filter must inherit from Error or be a simple predicate function\u000a\u000a    See http://goo.gl/o84o68\u000a"));
            }
        }
        catchInstances.length = j;
        fn = arguments[i];
        var catchFilter = new CatchFilter(catchInstances, fn, this);
        return this._then(undefined, catchFilter.doFilter, undefined,
            catchFilter, undefined);
    }
    return this._then(undefined, fn, undefined, undefined, undefined);
};

Promise.prototype.reflect = function () {
    return this._then(reflect, reflect, undefined, this, undefined);
};

Promise.prototype.then = function (didFulfill, didReject, didProgress) {
    if (isDebugging() && arguments.length > 0 &&
        typeof didFulfill !== "function" &&
        typeof didReject !== "function") {
        var msg = ".then() only accepts functions but was passed: " +
                util.classString(didFulfill);
        if (arguments.length > 1) {
            msg += ", " + util.classString(didReject);
        }
        this._warn(msg);
    }
    return this._then(didFulfill, didReject, didProgress,
        undefined, undefined);
};

Promise.prototype.done = function (didFulfill, didReject, didProgress) {
    var promise = this._then(didFulfill, didReject, didProgress,
        undefined, undefined);
    promise._setIsFinal();
};

Promise.prototype.spread = function (didFulfill, didReject) {
    return this.all()._then(didFulfill, didReject, undefined, APPLY, undefined);
};

Promise.prototype.isCancellable = function () {
    return !this.isResolved() &&
        this._cancellable();
};

Promise.prototype.toJSON = function () {
    var ret = {
        isFulfilled: false,
        isRejected: false,
        fulfillmentValue: undefined,
        rejectionReason: undefined
    };
    if (this.isFulfilled()) {
        ret.fulfillmentValue = this.value();
        ret.isFulfilled = true;
    } else if (this.isRejected()) {
        ret.rejectionReason = this.reason();
        ret.isRejected = true;
    }
    return ret;
};

Promise.prototype.all = function () {
    return new PromiseArray(this).promise();
};

Promise.prototype.error = function (fn) {
    return this.caught(util.originatesFromRejection, fn);
};

Promise.is = function (val) {
    return val instanceof Promise;
};

Promise.fromNode = function(fn) {
    var ret = new Promise(INTERNAL);
    var result = tryCatch(fn)(nodebackForPromise(ret));
    if (result === errorObj) {
        ret._rejectCallback(result.e, true, true);
    }
    return ret;
};

Promise.all = function (promises) {
    return new PromiseArray(promises).promise();
};

Promise.defer = Promise.pending = function () {
    var promise = new Promise(INTERNAL);
    return new PromiseResolver(promise);
};

Promise.cast = function (obj) {
    var ret = tryConvertToPromise(obj);
    if (!(ret instanceof Promise)) {
        var val = ret;
        ret = new Promise(INTERNAL);
        ret._fulfillUnchecked(val);
    }
    return ret;
};

Promise.resolve = Promise.fulfilled = Promise.cast;

Promise.reject = Promise.rejected = function (reason) {
    var ret = new Promise(INTERNAL);
    ret._captureStackTrace();
    ret._rejectCallback(reason, true);
    return ret;
};

Promise.setScheduler = function(fn) {
    if (typeof fn !== "function") throw new TypeError("fn must be a function\u000a\u000a    See http://goo.gl/916lJJ\u000a");
    var prev = async._schedule;
    async._schedule = fn;
    return prev;
};

Promise.prototype._then = function (
    didFulfill,
    didReject,
    didProgress,
    receiver,
    internalData
) {
    var haveInternalData = internalData !== undefined;
    var ret = haveInternalData ? internalData : new Promise(INTERNAL);

    if (!haveInternalData) {
        ret._propagateFrom(this, 4 | 1);
        ret._captureStackTrace();
    }

    var target = this._target();
    if (target !== this) {
        if (receiver === undefined) receiver = this._boundTo;
        if (!haveInternalData) ret._setIsMigrated();
    }

    var callbackIndex =
        target._addCallbacks(didFulfill, didReject, didProgress, ret, receiver);

    if (target._isResolved() && !target._isSettlePromisesQueued()) {
        async.invoke(
            target._settlePromiseAtPostResolution, target, callbackIndex);
    }

    return ret;
};

Promise.prototype._settlePromiseAtPostResolution = function (index) {
    if (this._isRejectionUnhandled()) this._unsetRejectionIsUnhandled();
    this._settlePromiseAt(index);
};

Promise.prototype._length = function () {
    return this._bitField & 131071;
};

Promise.prototype._isFollowingOrFulfilledOrRejected = function () {
    return (this._bitField & 939524096) > 0;
};

Promise.prototype._isFollowing = function () {
    return (this._bitField & 536870912) === 536870912;
};

Promise.prototype._setLength = function (len) {
    this._bitField = (this._bitField & -131072) |
        (len & 131071);
};

Promise.prototype._setFulfilled = function () {
    this._bitField = this._bitField | 268435456;
};

Promise.prototype._setRejected = function () {
    this._bitField = this._bitField | 134217728;
};

Promise.prototype._setFollowing = function () {
    this._bitField = this._bitField | 536870912;
};

Promise.prototype._setIsFinal = function () {
    this._bitField = this._bitField | 33554432;
};

Promise.prototype._isFinal = function () {
    return (this._bitField & 33554432) > 0;
};

Promise.prototype._cancellable = function () {
    return (this._bitField & 67108864) > 0;
};

Promise.prototype._setCancellable = function () {
    this._bitField = this._bitField | 67108864;
};

Promise.prototype._unsetCancellable = function () {
    this._bitField = this._bitField & (~67108864);
};

Promise.prototype._setIsMigrated = function () {
    this._bitField = this._bitField | 4194304;
};

Promise.prototype._unsetIsMigrated = function () {
    this._bitField = this._bitField & (~4194304);
};

Promise.prototype._isMigrated = function () {
    return (this._bitField & 4194304) > 0;
};

Promise.prototype._receiverAt = function (index) {
    var ret = index === 0
        ? this._receiver0
        : this[
            index * 5 - 5 + 4];
    if (ret === undefined && this._isBound()) {
        return this._boundTo;
    }
    return ret;
};

Promise.prototype._promiseAt = function (index) {
    return index === 0
        ? this._promise0
        : this[index * 5 - 5 + 3];
};

Promise.prototype._fulfillmentHandlerAt = function (index) {
    return index === 0
        ? this._fulfillmentHandler0
        : this[index * 5 - 5 + 0];
};

Promise.prototype._rejectionHandlerAt = function (index) {
    return index === 0
        ? this._rejectionHandler0
        : this[index * 5 - 5 + 1];
};

Promise.prototype._migrateCallbacks = function (follower, index) {
    var fulfill = follower._fulfillmentHandlerAt(index);
    var reject = follower._rejectionHandlerAt(index);
    var progress = follower._progressHandlerAt(index);
    var promise = follower._promiseAt(index);
    var receiver = follower._receiverAt(index);
    if (promise instanceof Promise) promise._setIsMigrated();
    this._addCallbacks(fulfill, reject, progress, promise, receiver);
};

Promise.prototype._addCallbacks = function (
    fulfill,
    reject,
    progress,
    promise,
    receiver
) {
    var index = this._length();

    if (index >= 131071 - 5) {
        index = 0;
        this._setLength(0);
    }

    if (index === 0) {
        this._promise0 = promise;
        if (receiver !== undefined) this._receiver0 = receiver;
        if (typeof fulfill === "function" && !this._isCarryingStackTrace())
            this._fulfillmentHandler0 = fulfill;
        if (typeof reject === "function") this._rejectionHandler0 = reject;
        if (typeof progress === "function") this._progressHandler0 = progress;
    } else {
        var base = index * 5 - 5;
        this[base + 3] = promise;
        this[base + 4] = receiver;
        if (typeof fulfill === "function")
            this[base + 0] = fulfill;
        if (typeof reject === "function")
            this[base + 1] = reject;
        if (typeof progress === "function")
            this[base + 2] = progress;
    }
    this._setLength(index + 1);
    return index;
};

Promise.prototype._setProxyHandlers = function (receiver, promiseSlotValue) {
    var index = this._length();

    if (index >= 131071 - 5) {
        index = 0;
        this._setLength(0);
    }
    if (index === 0) {
        this._promise0 = promiseSlotValue;
        this._receiver0 = receiver;
    } else {
        var base = index * 5 - 5;
        this[base + 3] = promiseSlotValue;
        this[base + 4] = receiver;
    }
    this._setLength(index + 1);
};

Promise.prototype._proxyPromiseArray = function (promiseArray, index) {
    this._setProxyHandlers(promiseArray, index);
};

Promise.prototype._resolveCallback = function(value, shouldBind) {
    if (this._isFollowingOrFulfilledOrRejected()) return;
    if (value === this)
        return this._rejectCallback(makeSelfResolutionError(), false, true);
    var maybePromise = tryConvertToPromise(value, this);
    if (!(maybePromise instanceof Promise)) return this._fulfill(value);

    var propagationFlags = 1 | (shouldBind ? 4 : 0);
    this._propagateFrom(maybePromise, propagationFlags);
    var promise = maybePromise._target();
    if (promise._isPending()) {
        var len = this._length();
        for (var i = 0; i < len; ++i) {
            promise._migrateCallbacks(this, i);
        }
        this._setFollowing();
        this._setLength(0);
        this._setFollowee(promise);
    } else if (promise._isFulfilled()) {
        this._fulfillUnchecked(promise._value());
    } else {
        this._rejectUnchecked(promise._reason(),
            promise._getCarriedStackTrace());
    }
};

Promise.prototype._rejectCallback =
function(reason, synchronous, shouldNotMarkOriginatingFromRejection) {
    if (!shouldNotMarkOriginatingFromRejection) {
        util.markAsOriginatingFromRejection(reason);
    }
    var trace = util.ensureErrorObject(reason);
    var hasStack = trace === reason;
    this._attachExtraTrace(trace, synchronous ? hasStack : false);
    this._reject(reason, hasStack ? undefined : trace);
};

Promise.prototype._resolveFromResolver = function (resolver) {
    var promise = this;
    this._captureStackTrace();
    this._pushContext();
    var synchronous = true;
    var r = tryCatch(resolver)(function(value) {
        if (promise === null) return;
        promise._resolveCallback(value);
        promise = null;
    }, function (reason) {
        if (promise === null) return;
        promise._rejectCallback(reason, synchronous);
        promise = null;
    });
    synchronous = false;
    this._popContext();

    if (r !== undefined && r === errorObj && promise !== null) {
        promise._rejectCallback(r.e, true, true);
        promise = null;
    }
};

Promise.prototype._settlePromiseFromHandler = function (
    handler, receiver, value, promise
) {
    if (promise._isRejected()) return;
    promise._pushContext();
    var x;
    if (receiver === APPLY && !this._isRejected()) {
        x = tryCatch(handler).apply(this._boundTo, value);
    } else {
        x = tryCatch(handler).call(receiver, value);
    }
    promise._popContext();

    if (x === errorObj || x === promise || x === NEXT_FILTER) {
        var err = x === promise ? makeSelfResolutionError() : x.e;
        promise._rejectCallback(err, false, true);
    } else {
        promise._resolveCallback(x);
    }
};

Promise.prototype._target = function() {
    var ret = this;
    while (ret._isFollowing()) ret = ret._followee();
    return ret;
};

Promise.prototype._followee = function() {
    return this._rejectionHandler0;
};

Promise.prototype._setFollowee = function(promise) {
    this._rejectionHandler0 = promise;
};

Promise.prototype._cleanValues = function () {
    if (this._cancellable()) {
        this._cancellationParent = undefined;
    }
};

Promise.prototype._propagateFrom = function (parent, flags) {
    if ((flags & 1) > 0 && parent._cancellable()) {
        this._setCancellable();
        this._cancellationParent = parent;
    }
    if ((flags & 4) > 0 && parent._isBound()) {
        this._setBoundTo(parent._boundTo);
    }
};

Promise.prototype._fulfill = function (value) {
    if (this._isFollowingOrFulfilledOrRejected()) return;
    this._fulfillUnchecked(value);
};

Promise.prototype._reject = function (reason, carriedStackTrace) {
    if (this._isFollowingOrFulfilledOrRejected()) return;
    this._rejectUnchecked(reason, carriedStackTrace);
};

Promise.prototype._settlePromiseAt = function (index) {
    var promise = this._promiseAt(index);
    var isPromise = promise instanceof Promise;

    if (isPromise && promise._isMigrated()) {
        promise._unsetIsMigrated();
        return async.invoke(this._settlePromiseAt, this, index);
    }
    var handler = this._isFulfilled()
        ? this._fulfillmentHandlerAt(index)
        : this._rejectionHandlerAt(index);

    var carriedStackTrace =
        this._isCarryingStackTrace() ? this._getCarriedStackTrace() : undefined;
    var value = this._settledValue;
    var receiver = this._receiverAt(index);


    this._clearCallbackDataAtIndex(index);

    if (typeof handler === "function") {
        if (!isPromise) {
            handler.call(receiver, value, promise);
        } else {
            this._settlePromiseFromHandler(handler, receiver, value, promise);
        }
    } else if (receiver instanceof PromiseArray) {
        if (!receiver._isResolved()) {
            if (this._isFulfilled()) {
                receiver._promiseFulfilled(value, promise);
            }
            else {
                receiver._promiseRejected(value, promise);
            }
        }
    } else if (isPromise) {
        if (this._isFulfilled()) {
            promise._fulfill(value);
        } else {
            promise._reject(value, carriedStackTrace);
        }
    }

    if (index >= 4 && (index & 31) === 4)
        async.invokeLater(this._setLength, this, 0);
};

Promise.prototype._clearCallbackDataAtIndex = function(index) {
    if (index === 0) {
        if (!this._isCarryingStackTrace()) {
            this._fulfillmentHandler0 = undefined;
        }
        this._rejectionHandler0 =
        this._progressHandler0 =
        this._receiver0 =
        this._promise0 = undefined;
    } else {
        var base = index * 5 - 5;
        this[base + 3] =
        this[base + 4] =
        this[base + 0] =
        this[base + 1] =
        this[base + 2] = undefined;
    }
};

Promise.prototype._isSettlePromisesQueued = function () {
    return (this._bitField &
            -1073741824) === -1073741824;
};

Promise.prototype._setSettlePromisesQueued = function () {
    this._bitField = this._bitField | -1073741824;
};

Promise.prototype._unsetSettlePromisesQueued = function () {
    this._bitField = this._bitField & (~-1073741824);
};

Promise.prototype._queueSettlePromises = function() {
    async.settlePromises(this);
    this._setSettlePromisesQueued();
};

Promise.prototype._fulfillUnchecked = function (value) {
    if (value === this) {
        var err = makeSelfResolutionError();
        this._attachExtraTrace(err);
        return this._rejectUnchecked(err, undefined);
    }
    this._setFulfilled();
    this._settledValue = value;
    this._cleanValues();

    if (this._length() > 0) {
        this._queueSettlePromises();
    }
};

Promise.prototype._rejectUncheckedCheckError = function (reason) {
    var trace = util.ensureErrorObject(reason);
    this._rejectUnchecked(reason, trace === reason ? undefined : trace);
};

Promise.prototype._rejectUnchecked = function (reason, trace) {
    if (reason === this) {
        var err = makeSelfResolutionError();
        this._attachExtraTrace(err);
        return this._rejectUnchecked(err);
    }
    this._setRejected();
    this._settledValue = reason;
    this._cleanValues();

    if (this._isFinal()) {
        async.throwLater(function(e) {
            if ("stack" in e) {
                async.invokeFirst(
                    CapturedTrace.unhandledRejection, undefined, e);
            }
            throw e;
        }, trace === undefined ? reason : trace);
        return;
    }

    if (trace !== undefined && trace !== reason) {
        this._setCarriedStackTrace(trace);
    }

    if (this._length() > 0) {
        this._queueSettlePromises();
    } else {
        this._ensurePossibleRejectionHandled();
    }
};

Promise.prototype._settlePromises = function () {
    this._unsetSettlePromisesQueued();
    var len = this._length();
    for (var i = 0; i < len; i++) {
        this._settlePromiseAt(i);
    }
};

Promise._makeSelfResolutionError = makeSelfResolutionError;
_dereq_("./progress.js")(Promise, PromiseArray);
_dereq_("./method.js")(Promise, INTERNAL, tryConvertToPromise, apiRejection);
_dereq_("./bind.js")(Promise, INTERNAL, tryConvertToPromise);
_dereq_("./finally.js")(Promise, NEXT_FILTER, tryConvertToPromise);
_dereq_("./direct_resolve.js")(Promise);
_dereq_("./synchronous_inspection.js")(Promise);
_dereq_("./join.js")(Promise, PromiseArray, tryConvertToPromise, INTERNAL);
Promise.Promise = Promise;
_dereq_('./map.js')(Promise, PromiseArray, apiRejection, tryConvertToPromise, INTERNAL);
_dereq_('./cancel.js')(Promise);
_dereq_('./using.js')(Promise, apiRejection, tryConvertToPromise, createContext);
_dereq_('./generators.js')(Promise, apiRejection, INTERNAL, tryConvertToPromise);
_dereq_('./nodeify.js')(Promise);
_dereq_('./call_get.js')(Promise);
_dereq_('./props.js')(Promise, PromiseArray, tryConvertToPromise, apiRejection);
_dereq_('./race.js')(Promise, INTERNAL, tryConvertToPromise, apiRejection);
_dereq_('./reduce.js')(Promise, PromiseArray, apiRejection, tryConvertToPromise, INTERNAL);
_dereq_('./settle.js')(Promise, PromiseArray);
_dereq_('./some.js')(Promise, PromiseArray, apiRejection);
_dereq_('./promisify.js')(Promise, INTERNAL);
_dereq_('./any.js')(Promise);
_dereq_('./each.js')(Promise, INTERNAL);
_dereq_('./timers.js')(Promise, INTERNAL);
_dereq_('./filter.js')(Promise, INTERNAL);
                                                         
    util.toFastProperties(Promise);                                          
    util.toFastProperties(Promise.prototype);                                
    function fillTypes(value) {                                              
        var p = new Promise(INTERNAL);                                       
        p._fulfillmentHandler0 = value;                                      
        p._rejectionHandler0 = value;                                        
        p._progressHandler0 = value;                                         
        p._promise0 = value;                                                 
        p._receiver0 = value;                                                
        p._settledValue = value;                                             
    }                                                                        
    // Complete slack tracking, opt out of field-type tracking and           
    // stabilize map                                                         
    fillTypes({a: 1});                                                       
    fillTypes({b: 2});                                                       
    fillTypes({c: 3});                                                       
    fillTypes(1);                                                            
    fillTypes(function(){});                                                 
    fillTypes(undefined);                                                    
    fillTypes(false);                                                        
    fillTypes(new Promise(INTERNAL));                                        
    CapturedTrace.setBounds(async.firstLineError, util.lastLineError);       
    return Promise;                                                          

};

},{"./any.js":1,"./async.js":2,"./bind.js":3,"./call_get.js":5,"./cancel.js":6,"./captured_trace.js":7,"./catch_filter.js":8,"./context.js":9,"./debuggability.js":10,"./direct_resolve.js":11,"./each.js":12,"./errors.js":13,"./filter.js":15,"./finally.js":16,"./generators.js":17,"./join.js":18,"./map.js":19,"./method.js":20,"./nodeify.js":21,"./progress.js":22,"./promise_array.js":24,"./promise_resolver.js":25,"./promisify.js":26,"./props.js":27,"./race.js":29,"./reduce.js":30,"./settle.js":32,"./some.js":33,"./synchronous_inspection.js":34,"./thenables.js":35,"./timers.js":36,"./using.js":37,"./util.js":38}],24:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, INTERNAL, tryConvertToPromise,
    apiRejection) {
var util = _dereq_("./util.js");
var isArray = util.isArray;

function toResolutionValue(val) {
    switch(val) {
    case -2: return [];
    case -3: return {};
    }
}

function PromiseArray(values) {
    var promise = this._promise = new Promise(INTERNAL);
    var parent;
    if (values instanceof Promise) {
        parent = values;
        promise._propagateFrom(parent, 1 | 4);
    }
    this._values = values;
    this._length = 0;
    this._totalResolved = 0;
    this._init(undefined, -2);
}
PromiseArray.prototype.length = function () {
    return this._length;
};

PromiseArray.prototype.promise = function () {
    return this._promise;
};

PromiseArray.prototype._init = function init(_, resolveValueIfEmpty) {
    var values = tryConvertToPromise(this._values, this._promise);
    if (values instanceof Promise) {
        values = values._target();
        this._values = values;
        if (values._isFulfilled()) {
            values = values._value();
            if (!isArray(values)) {
                var err = new Promise.TypeError("expecting an array, a promise or a thenable\u000a\u000a    See http://goo.gl/s8MMhc\u000a");
                this.__hardReject__(err);
                return;
            }
        } else if (values._isPending()) {
            values._then(
                init,
                this._reject,
                undefined,
                this,
                resolveValueIfEmpty
           );
            return;
        } else {
            this._reject(values._reason());
            return;
        }
    } else if (!isArray(values)) {
        this._promise._reject(apiRejection("expecting an array, a promise or a thenable\u000a\u000a    See http://goo.gl/s8MMhc\u000a")._reason());
        return;
    }

    if (values.length === 0) {
        if (resolveValueIfEmpty === -5) {
            this._resolveEmptyArray();
        }
        else {
            this._resolve(toResolutionValue(resolveValueIfEmpty));
        }
        return;
    }
    var len = this.getActualLength(values.length);
    this._length = len;
    this._values = this.shouldCopyValues() ? new Array(len) : this._values;
    var promise = this._promise;
    for (var i = 0; i < len; ++i) {
        var isResolved = this._isResolved();
        var maybePromise = tryConvertToPromise(values[i], promise);
        if (maybePromise instanceof Promise) {
            maybePromise = maybePromise._target();
            if (isResolved) {
                maybePromise._unsetRejectionIsUnhandled();
            } else if (maybePromise._isPending()) {
                maybePromise._proxyPromiseArray(this, i);
            } else if (maybePromise._isFulfilled()) {
                this._promiseFulfilled(maybePromise._value(), i);
            } else {
                this._promiseRejected(maybePromise._reason(), i);
            }
        } else if (!isResolved) {
            this._promiseFulfilled(maybePromise, i);
        }
    }
};

PromiseArray.prototype._isResolved = function () {
    return this._values === null;
};

PromiseArray.prototype._resolve = function (value) {
    this._values = null;
    this._promise._fulfill(value);
};

PromiseArray.prototype.__hardReject__ =
PromiseArray.prototype._reject = function (reason) {
    this._values = null;
    this._promise._rejectCallback(reason, false, true);
};

PromiseArray.prototype._promiseProgressed = function (progressValue, index) {
    this._promise._progress({
        index: index,
        value: progressValue
    });
};


PromiseArray.prototype._promiseFulfilled = function (value, index) {
    this._values[index] = value;
    var totalResolved = ++this._totalResolved;
    if (totalResolved >= this._length) {
        this._resolve(this._values);
    }
};

PromiseArray.prototype._promiseRejected = function (reason, index) {
    this._totalResolved++;
    this._reject(reason);
};

PromiseArray.prototype.shouldCopyValues = function () {
    return true;
};

PromiseArray.prototype.getActualLength = function (len) {
    return len;
};

return PromiseArray;
};

},{"./util.js":38}],25:[function(_dereq_,module,exports){
"use strict";
var util = _dereq_("./util.js");
var maybeWrapAsError = util.maybeWrapAsError;
var errors = _dereq_("./errors.js");
var TimeoutError = errors.TimeoutError;
var OperationalError = errors.OperationalError;
var haveGetters = util.haveGetters;
var es5 = _dereq_("./es5.js");

function isUntypedError(obj) {
    return obj instanceof Error &&
        es5.getPrototypeOf(obj) === Error.prototype;
}

var rErrorKey = /^(?:name|message|stack|cause)$/;
function wrapAsOperationalError(obj) {
    var ret;
    if (isUntypedError(obj)) {
        ret = new OperationalError(obj);
        ret.name = obj.name;
        ret.message = obj.message;
        ret.stack = obj.stack;
        var keys = es5.keys(obj);
        for (var i = 0; i < keys.length; ++i) {
            var key = keys[i];
            if (!rErrorKey.test(key)) {
                ret[key] = obj[key];
            }
        }
        return ret;
    }
    util.markAsOriginatingFromRejection(obj);
    return obj;
}

function nodebackForPromise(promise) {
    return function(err, value) {
        if (promise === null) return;

        if (err) {
            var wrapped = wrapAsOperationalError(maybeWrapAsError(err));
            promise._attachExtraTrace(wrapped);
            promise._reject(wrapped);
        } else if (arguments.length > 2) {
            var $_len = arguments.length;var args = new Array($_len - 1); for(var $_i = 1; $_i < $_len; ++$_i) {args[$_i - 1] = arguments[$_i];}
            promise._fulfill(args);
        } else {
            promise._fulfill(value);
        }

        promise = null;
    };
}


var PromiseResolver;
if (!haveGetters) {
    PromiseResolver = function (promise) {
        this.promise = promise;
        this.asCallback = nodebackForPromise(promise);
        this.callback = this.asCallback;
    };
}
else {
    PromiseResolver = function (promise) {
        this.promise = promise;
    };
}
if (haveGetters) {
    var prop = {
        get: function() {
            return nodebackForPromise(this.promise);
        }
    };
    es5.defineProperty(PromiseResolver.prototype, "asCallback", prop);
    es5.defineProperty(PromiseResolver.prototype, "callback", prop);
}

PromiseResolver._nodebackForPromise = nodebackForPromise;

PromiseResolver.prototype.toString = function () {
    return "[object PromiseResolver]";
};

PromiseResolver.prototype.resolve =
PromiseResolver.prototype.fulfill = function (value) {
    if (!(this instanceof PromiseResolver)) {
        throw new TypeError("Illegal invocation, resolver resolve/reject must be called within a resolver context. Consider using the promise constructor instead.\u000a\u000a    See http://goo.gl/sdkXL9\u000a");
    }
    this.promise._resolveCallback(value);
};

PromiseResolver.prototype.reject = function (reason) {
    if (!(this instanceof PromiseResolver)) {
        throw new TypeError("Illegal invocation, resolver resolve/reject must be called within a resolver context. Consider using the promise constructor instead.\u000a\u000a    See http://goo.gl/sdkXL9\u000a");
    }
    this.promise._rejectCallback(reason);
};

PromiseResolver.prototype.progress = function (value) {
    if (!(this instanceof PromiseResolver)) {
        throw new TypeError("Illegal invocation, resolver resolve/reject must be called within a resolver context. Consider using the promise constructor instead.\u000a\u000a    See http://goo.gl/sdkXL9\u000a");
    }
    this.promise._progress(value);
};

PromiseResolver.prototype.cancel = function (err) {
    this.promise.cancel(err);
};

PromiseResolver.prototype.timeout = function () {
    this.reject(new TimeoutError("timeout"));
};

PromiseResolver.prototype.isResolved = function () {
    return this.promise.isResolved();
};

PromiseResolver.prototype.toJSON = function () {
    return this.promise.toJSON();
};

module.exports = PromiseResolver;

},{"./errors.js":13,"./es5.js":14,"./util.js":38}],26:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, INTERNAL) {
var THIS = {};
var util = _dereq_("./util.js");
var nodebackForPromise = _dereq_("./promise_resolver.js")
    ._nodebackForPromise;
var withAppended = util.withAppended;
var maybeWrapAsError = util.maybeWrapAsError;
var canEvaluate = util.canEvaluate;
var TypeError = _dereq_("./errors").TypeError;
var defaultSuffix = "Async";
var defaultPromisified = {__isPromisified__: true};
var noCopyPropsPattern =
    /^(?:length|name|arguments|caller|callee|prototype|__isPromisified__)$/;
var defaultFilter = function(name, func) {
    return util.isIdentifier(name) &&
        name.charAt(0) !== "_" &&
        !util.isClass(func);
};

function propsFilter(key) {
    return !noCopyPropsPattern.test(key);
}

function isPromisified(fn) {
    try {
        return fn.__isPromisified__ === true;
    }
    catch (e) {
        return false;
    }
}

function hasPromisified(obj, key, suffix) {
    var val = util.getDataPropertyOrDefault(obj, key + suffix,
                                            defaultPromisified);
    return val ? isPromisified(val) : false;
}
function checkValid(ret, suffix, suffixRegexp) {
    for (var i = 0; i < ret.length; i += 2) {
        var key = ret[i];
        if (suffixRegexp.test(key)) {
            var keyWithoutAsyncSuffix = key.replace(suffixRegexp, "");
            for (var j = 0; j < ret.length; j += 2) {
                if (ret[j] === keyWithoutAsyncSuffix) {
                    throw new TypeError("Cannot promisify an API that has normal methods with '%s'-suffix\u000a\u000a    See http://goo.gl/iWrZbw\u000a"
                        .replace("%s", suffix));
                }
            }
        }
    }
}

function promisifiableMethods(obj, suffix, suffixRegexp, filter) {
    var keys = util.inheritedDataKeys(obj);
    var ret = [];
    for (var i = 0; i < keys.length; ++i) {
        var key = keys[i];
        var value = obj[key];
        var passesDefaultFilter = filter === defaultFilter
            ? true : defaultFilter(key, value, obj);
        if (typeof value === "function" &&
            !isPromisified(value) &&
            !hasPromisified(obj, key, suffix) &&
            filter(key, value, obj, passesDefaultFilter)) {
            ret.push(key, value);
        }
    }
    checkValid(ret, suffix, suffixRegexp);
    return ret;
}

var escapeIdentRegex = function(str) {
    return str.replace(/([$])/, "\\$");
};

var makeNodePromisifiedEval;
if (!true) {
var switchCaseArgumentOrder = function(likelyArgumentCount) {
    var ret = [likelyArgumentCount];
    var min = Math.max(0, likelyArgumentCount - 1 - 3);
    for(var i = likelyArgumentCount - 1; i >= min; --i) {
        ret.push(i);
    }
    for(var i = likelyArgumentCount + 1; i <= 3; ++i) {
        ret.push(i);
    }
    return ret;
};

var argumentSequence = function(argumentCount) {
    return util.filledRange(argumentCount, "_arg", "");
};

var parameterDeclaration = function(parameterCount) {
    return util.filledRange(
        Math.max(parameterCount, 3), "_arg", "");
};

var parameterCount = function(fn) {
    if (typeof fn.length === "number") {
        return Math.max(Math.min(fn.length, 1023 + 1), 0);
    }
    return 0;
};

makeNodePromisifiedEval =
function(callback, receiver, originalName, fn) {
    var newParameterCount = Math.max(0, parameterCount(fn) - 1);
    var argumentOrder = switchCaseArgumentOrder(newParameterCount);
    var shouldProxyThis = typeof callback === "string" || receiver === THIS;

    function generateCallForArgumentCount(count) {
        var args = argumentSequence(count).join(", ");
        var comma = count > 0 ? ", " : "";
        var ret;
        if (shouldProxyThis) {
            ret = "ret = callback.call(this, {{args}}, nodeback); break;\n";
        } else {
            ret = receiver === undefined
                ? "ret = callback({{args}}, nodeback); break;\n"
                : "ret = callback.call(receiver, {{args}}, nodeback); break;\n";
        }
        return ret.replace("{{args}}", args).replace(", ", comma);
    }

    function generateArgumentSwitchCase() {
        var ret = "";
        for (var i = 0; i < argumentOrder.length; ++i) {
            ret += "case " + argumentOrder[i] +":" +
                generateCallForArgumentCount(argumentOrder[i]);
        }

        ret += "                                                             \n\
        default:                                                             \n\
            var args = new Array(len + 1);                                   \n\
            var i = 0;                                                       \n\
            for (var i = 0; i < len; ++i) {                                  \n\
               args[i] = arguments[i];                                       \n\
            }                                                                \n\
            args[i] = nodeback;                                              \n\
            [CodeForCall]                                                    \n\
            break;                                                           \n\
        ".replace("[CodeForCall]", (shouldProxyThis
                                ? "ret = callback.apply(this, args);\n"
                                : "ret = callback.apply(receiver, args);\n"));
        return ret;
    }

    var getFunctionCode = typeof callback === "string"
                                ? ("this != null ? this['"+callback+"'] : fn")
                                : "fn";

    return new Function("Promise",
                        "fn",
                        "receiver",
                        "withAppended",
                        "maybeWrapAsError",
                        "nodebackForPromise",
                        "tryCatch",
                        "errorObj",
                        "INTERNAL","'use strict';                            \n\
        var ret = function (Parameters) {                                    \n\
            'use strict';                                                    \n\
            var len = arguments.length;                                      \n\
            var promise = new Promise(INTERNAL);                             \n\
            promise._captureStackTrace();                                    \n\
            var nodeback = nodebackForPromise(promise);                      \n\
            var ret;                                                         \n\
            var callback = tryCatch([GetFunctionCode]);                      \n\
            switch(len) {                                                    \n\
                [CodeForSwitchCase]                                          \n\
            }                                                                \n\
            if (ret === errorObj) {                                          \n\
                promise._rejectCallback(maybeWrapAsError(ret.e), true, true);\n\
            }                                                                \n\
            return promise;                                                  \n\
        };                                                                   \n\
        ret.__isPromisified__ = true;                                        \n\
        return ret;                                                          \n\
        "
        .replace("Parameters", parameterDeclaration(newParameterCount))
        .replace("[CodeForSwitchCase]", generateArgumentSwitchCase())
        .replace("[GetFunctionCode]", getFunctionCode))(
            Promise,
            fn,
            receiver,
            withAppended,
            maybeWrapAsError,
            nodebackForPromise,
            util.tryCatch,
            util.errorObj,
            INTERNAL
        );
};
}

function makeNodePromisifiedClosure(callback, receiver, _, fn) {
    var defaultThis = (function() {return this;})();
    var method = callback;
    if (typeof method === "string") {
        callback = fn;
    }
    function promisified() {
        var _receiver = receiver;
        if (receiver === THIS) _receiver = this;
        var promise = new Promise(INTERNAL);
        promise._captureStackTrace();
        var cb = typeof method === "string" && this !== defaultThis
            ? this[method] : callback;
        var fn = nodebackForPromise(promise);
        try {
            cb.apply(_receiver, withAppended(arguments, fn));
        } catch(e) {
            promise._rejectCallback(maybeWrapAsError(e), true, true);
        }
        return promise;
    }
    promisified.__isPromisified__ = true;
    return promisified;
}

var makeNodePromisified = canEvaluate
    ? makeNodePromisifiedEval
    : makeNodePromisifiedClosure;

function promisifyAll(obj, suffix, filter, promisifier) {
    var suffixRegexp = new RegExp(escapeIdentRegex(suffix) + "$");
    var methods =
        promisifiableMethods(obj, suffix, suffixRegexp, filter);

    for (var i = 0, len = methods.length; i < len; i+= 2) {
        var key = methods[i];
        var fn = methods[i+1];
        var promisifiedKey = key + suffix;
        obj[promisifiedKey] = promisifier === makeNodePromisified
                ? makeNodePromisified(key, THIS, key, fn, suffix)
                : promisifier(fn, function() {
                    return makeNodePromisified(key, THIS, key, fn, suffix);
                });
    }
    util.toFastProperties(obj);
    return obj;
}

function promisify(callback, receiver) {
    return makeNodePromisified(callback, receiver, undefined, callback);
}

Promise.promisify = function (fn, receiver) {
    if (typeof fn !== "function") {
        throw new TypeError("fn must be a function\u000a\u000a    See http://goo.gl/916lJJ\u000a");
    }
    if (isPromisified(fn)) {
        return fn;
    }
    var ret = promisify(fn, arguments.length < 2 ? THIS : receiver);
    util.copyDescriptors(fn, ret, propsFilter);
    return ret;
};

Promise.promisifyAll = function (target, options) {
    if (typeof target !== "function" && typeof target !== "object") {
        throw new TypeError("the target of promisifyAll must be an object or a function\u000a\u000a    See http://goo.gl/9ITlV0\u000a");
    }
    options = Object(options);
    var suffix = options.suffix;
    if (typeof suffix !== "string") suffix = defaultSuffix;
    var filter = options.filter;
    if (typeof filter !== "function") filter = defaultFilter;
    var promisifier = options.promisifier;
    if (typeof promisifier !== "function") promisifier = makeNodePromisified;

    if (!util.isIdentifier(suffix)) {
        throw new RangeError("suffix must be a valid identifier\u000a\u000a    See http://goo.gl/8FZo5V\u000a");
    }

    var keys = util.inheritedDataKeys(target);
    for (var i = 0; i < keys.length; ++i) {
        var value = target[keys[i]];
        if (keys[i] !== "constructor" &&
            util.isClass(value)) {
            promisifyAll(value.prototype, suffix, filter, promisifier);
            promisifyAll(value, suffix, filter, promisifier);
        }
    }

    return promisifyAll(target, suffix, filter, promisifier);
};
};


},{"./errors":13,"./promise_resolver.js":25,"./util.js":38}],27:[function(_dereq_,module,exports){
"use strict";
module.exports = function(
    Promise, PromiseArray, tryConvertToPromise, apiRejection) {
var util = _dereq_("./util.js");
var isObject = util.isObject;
var es5 = _dereq_("./es5.js");

function PropertiesPromiseArray(obj) {
    var keys = es5.keys(obj);
    var len = keys.length;
    var values = new Array(len * 2);
    for (var i = 0; i < len; ++i) {
        var key = keys[i];
        values[i] = obj[key];
        values[i + len] = key;
    }
    this.constructor$(values);
}
util.inherits(PropertiesPromiseArray, PromiseArray);

PropertiesPromiseArray.prototype._init = function () {
    this._init$(undefined, -3) ;
};

PropertiesPromiseArray.prototype._promiseFulfilled = function (value, index) {
    this._values[index] = value;
    var totalResolved = ++this._totalResolved;
    if (totalResolved >= this._length) {
        var val = {};
        var keyOffset = this.length();
        for (var i = 0, len = this.length(); i < len; ++i) {
            val[this._values[i + keyOffset]] = this._values[i];
        }
        this._resolve(val);
    }
};

PropertiesPromiseArray.prototype._promiseProgressed = function (value, index) {
    this._promise._progress({
        key: this._values[index + this.length()],
        value: value
    });
};

PropertiesPromiseArray.prototype.shouldCopyValues = function () {
    return false;
};

PropertiesPromiseArray.prototype.getActualLength = function (len) {
    return len >> 1;
};

function props(promises) {
    var ret;
    var castValue = tryConvertToPromise(promises);

    if (!isObject(castValue)) {
        return apiRejection("cannot await properties of a non-object\u000a\u000a    See http://goo.gl/OsFKC8\u000a");
    } else if (castValue instanceof Promise) {
        ret = castValue._then(
            Promise.props, undefined, undefined, undefined, undefined);
    } else {
        ret = new PropertiesPromiseArray(castValue).promise();
    }

    if (castValue instanceof Promise) {
        ret._propagateFrom(castValue, 4);
    }
    return ret;
}

Promise.prototype.props = function () {
    return props(this);
};

Promise.props = function (promises) {
    return props(promises);
};
};

},{"./es5.js":14,"./util.js":38}],28:[function(_dereq_,module,exports){
"use strict";
function arrayMove(src, srcIndex, dst, dstIndex, len) {
    for (var j = 0; j < len; ++j) {
        dst[j + dstIndex] = src[j + srcIndex];
        src[j + srcIndex] = void 0;
    }
}

function Queue(capacity) {
    this._capacity = capacity;
    this._length = 0;
    this._front = 0;
}

Queue.prototype._willBeOverCapacity = function (size) {
    return this._capacity < size;
};

Queue.prototype._pushOne = function (arg) {
    var length = this.length();
    this._checkCapacity(length + 1);
    var i = (this._front + length) & (this._capacity - 1);
    this[i] = arg;
    this._length = length + 1;
};

Queue.prototype._unshiftOne = function(value) {
    var capacity = this._capacity;
    this._checkCapacity(this.length() + 1);
    var front = this._front;
    var i = (((( front - 1 ) &
                    ( capacity - 1) ) ^ capacity ) - capacity );
    this[i] = value;
    this._front = i;
    this._length = this.length() + 1;
};

Queue.prototype.unshift = function(fn, receiver, arg) {
    this._unshiftOne(arg);
    this._unshiftOne(receiver);
    this._unshiftOne(fn);
};

Queue.prototype.push = function (fn, receiver, arg) {
    var length = this.length() + 3;
    if (this._willBeOverCapacity(length)) {
        this._pushOne(fn);
        this._pushOne(receiver);
        this._pushOne(arg);
        return;
    }
    var j = this._front + length - 3;
    this._checkCapacity(length);
    var wrapMask = this._capacity - 1;
    this[(j + 0) & wrapMask] = fn;
    this[(j + 1) & wrapMask] = receiver;
    this[(j + 2) & wrapMask] = arg;
    this._length = length;
};

Queue.prototype.shift = function () {
    var front = this._front,
        ret = this[front];

    this[front] = undefined;
    this._front = (front + 1) & (this._capacity - 1);
    this._length--;
    return ret;
};

Queue.prototype.length = function () {
    return this._length;
};

Queue.prototype._checkCapacity = function (size) {
    if (this._capacity < size) {
        this._resizeTo(this._capacity << 1);
    }
};

Queue.prototype._resizeTo = function (capacity) {
    var oldCapacity = this._capacity;
    this._capacity = capacity;
    var front = this._front;
    var length = this._length;
    var moveItemsCount = (front + length) & (oldCapacity - 1);
    arrayMove(this, 0, this, oldCapacity, moveItemsCount);
};

module.exports = Queue;

},{}],29:[function(_dereq_,module,exports){
"use strict";
module.exports = function(
    Promise, INTERNAL, tryConvertToPromise, apiRejection) {
var isArray = _dereq_("./util.js").isArray;

var raceLater = function (promise) {
    return promise.then(function(array) {
        return race(array, promise);
    });
};

function race(promises, parent) {
    var maybePromise = tryConvertToPromise(promises);

    if (maybePromise instanceof Promise) {
        return raceLater(maybePromise);
    } else if (!isArray(promises)) {
        return apiRejection("expecting an array, a promise or a thenable\u000a\u000a    See http://goo.gl/s8MMhc\u000a");
    }

    var ret = new Promise(INTERNAL);
    if (parent !== undefined) {
        ret._propagateFrom(parent, 4 | 1);
    }
    var fulfill = ret._fulfill;
    var reject = ret._reject;
    for (var i = 0, len = promises.length; i < len; ++i) {
        var val = promises[i];

        if (val === undefined && !(i in promises)) {
            continue;
        }

        Promise.cast(val)._then(fulfill, reject, undefined, ret, null);
    }
    return ret;
}

Promise.race = function (promises) {
    return race(promises, undefined);
};

Promise.prototype.race = function () {
    return race(this, undefined);
};

};

},{"./util.js":38}],30:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise,
                          PromiseArray,
                          apiRejection,
                          tryConvertToPromise,
                          INTERNAL) {
var async = _dereq_("./async.js");
var util = _dereq_("./util.js");
var tryCatch = util.tryCatch;
var errorObj = util.errorObj;
function ReductionPromiseArray(promises, fn, accum, _each) {
    this.constructor$(promises);
    this._promise._captureStackTrace();
    this._preservedValues = _each === INTERNAL ? [] : null;
    this._zerothIsAccum = (accum === undefined);
    this._gotAccum = false;
    this._reducingIndex = (this._zerothIsAccum ? 1 : 0);
    this._valuesPhase = undefined;
    var maybePromise = tryConvertToPromise(accum, this._promise);
    var rejected = false;
    var isPromise = maybePromise instanceof Promise;
    if (isPromise) {
        maybePromise = maybePromise._target();
        if (maybePromise._isPending()) {
            maybePromise._proxyPromiseArray(this, -1);
        } else if (maybePromise._isFulfilled()) {
            accum = maybePromise._value();
            this._gotAccum = true;
        } else {
            this._reject(maybePromise._reason());
            rejected = true;
        }
    }
    if (!(isPromise || this._zerothIsAccum)) this._gotAccum = true;
    this._callback = fn;
    this._accum = accum;
    if (!rejected) async.invoke(init, this, undefined);
}
function init() {
    this._init$(undefined, -5);
}
util.inherits(ReductionPromiseArray, PromiseArray);

ReductionPromiseArray.prototype._init = function () {};

ReductionPromiseArray.prototype._resolveEmptyArray = function () {
    if (this._gotAccum || this._zerothIsAccum) {
        this._resolve(this._preservedValues !== null
                        ? [] : this._accum);
    }
};

ReductionPromiseArray.prototype._promiseFulfilled = function (value, index) {
    var values = this._values;
    values[index] = value;
    var length = this.length();
    var preservedValues = this._preservedValues;
    var isEach = preservedValues !== null;
    var gotAccum = this._gotAccum;
    var valuesPhase = this._valuesPhase;
    var valuesPhaseIndex;
    if (!valuesPhase) {
        valuesPhase = this._valuesPhase = new Array(length);
        for (valuesPhaseIndex=0; valuesPhaseIndex<length; ++valuesPhaseIndex) {
            valuesPhase[valuesPhaseIndex] = 0;
        }
    }
    valuesPhaseIndex = valuesPhase[index];

    if (index === 0 && this._zerothIsAccum) {
        this._accum = value;
        this._gotAccum = gotAccum = true;
        valuesPhase[index] = ((valuesPhaseIndex === 0)
            ? 1 : 2);
    } else if (index === -1) {
        this._accum = value;
        this._gotAccum = gotAccum = true;
    } else {
        if (valuesPhaseIndex === 0) {
            valuesPhase[index] = 1;
        } else {
            valuesPhase[index] = 2;
            this._accum = value;
        }
    }
    if (!gotAccum) return;

    var callback = this._callback;
    var receiver = this._promise._boundTo;
    var ret;

    for (var i = this._reducingIndex; i < length; ++i) {
        valuesPhaseIndex = valuesPhase[i];
        if (valuesPhaseIndex === 2) {
            this._reducingIndex = i + 1;
            continue;
        }
        if (valuesPhaseIndex !== 1) return;
        value = values[i];
        this._promise._pushContext();
        if (isEach) {
            preservedValues.push(value);
            ret = tryCatch(callback).call(receiver, value, i, length);
        }
        else {
            ret = tryCatch(callback)
                .call(receiver, this._accum, value, i, length);
        }
        this._promise._popContext();

        if (ret === errorObj) return this._reject(ret.e);

        var maybePromise = tryConvertToPromise(ret, this._promise);
        if (maybePromise instanceof Promise) {
            maybePromise = maybePromise._target();
            if (maybePromise._isPending()) {
                valuesPhase[i] = 4;
                return maybePromise._proxyPromiseArray(this, i);
            } else if (maybePromise._isFulfilled()) {
                ret = maybePromise._value();
            } else {
                return this._reject(maybePromise._reason());
            }
        }

        this._reducingIndex = i + 1;
        this._accum = ret;
    }

    this._resolve(isEach ? preservedValues : this._accum);
};

function reduce(promises, fn, initialValue, _each) {
    if (typeof fn !== "function") return apiRejection("fn must be a function\u000a\u000a    See http://goo.gl/916lJJ\u000a");
    var array = new ReductionPromiseArray(promises, fn, initialValue, _each);
    return array.promise();
}

Promise.prototype.reduce = function (fn, initialValue) {
    return reduce(this, fn, initialValue, null);
};

Promise.reduce = function (promises, fn, initialValue, _each) {
    return reduce(promises, fn, initialValue, _each);
};
};

},{"./async.js":2,"./util.js":38}],31:[function(_dereq_,module,exports){
"use strict";
var schedule;
var noAsyncScheduler = function() {
    throw new Error("No async scheduler available\u000a\u000a    See http://goo.gl/m3OTXk\u000a");
};
if (_dereq_("./util.js").isNode) {
    var version = process.versions.node.split(".").map(Number);
    schedule = (version[0] === 0 && version[1] > 10) || (version[0] > 0)
        ? global.setImmediate : process.nextTick;

    if (!schedule) {
        if (typeof setImmediate !== "undefined") {
            schedule = setImmediate;
        } else if (typeof setTimeout !== "undefined") {
            schedule = setTimeout;
        } else {
            schedule = noAsyncScheduler;
        }
    }
} else if (typeof MutationObserver !== "undefined") {
    schedule = function(fn) {
        var div = document.createElement("div");
        var observer = new MutationObserver(fn);
        observer.observe(div, {attributes: true});
        return function() { div.classList.toggle("foo"); };
    };
    schedule.isStatic = true;
} else if (typeof setImmediate !== "undefined") {
    schedule = function (fn) {
        setImmediate(fn);
    };
} else if (typeof setTimeout !== "undefined") {
    schedule = function (fn) {
        setTimeout(fn, 0);
    };
} else {
    schedule = noAsyncScheduler;
}
module.exports = schedule;

},{"./util.js":38}],32:[function(_dereq_,module,exports){
"use strict";
module.exports =
    function(Promise, PromiseArray) {
var PromiseInspection = Promise.PromiseInspection;
var util = _dereq_("./util.js");

function SettledPromiseArray(values) {
    this.constructor$(values);
}
util.inherits(SettledPromiseArray, PromiseArray);

SettledPromiseArray.prototype._promiseResolved = function (index, inspection) {
    this._values[index] = inspection;
    var totalResolved = ++this._totalResolved;
    if (totalResolved >= this._length) {
        this._resolve(this._values);
    }
};

SettledPromiseArray.prototype._promiseFulfilled = function (value, index) {
    var ret = new PromiseInspection();
    ret._bitField = 268435456;
    ret._settledValue = value;
    this._promiseResolved(index, ret);
};
SettledPromiseArray.prototype._promiseRejected = function (reason, index) {
    var ret = new PromiseInspection();
    ret._bitField = 134217728;
    ret._settledValue = reason;
    this._promiseResolved(index, ret);
};

Promise.settle = function (promises) {
    return new SettledPromiseArray(promises).promise();
};

Promise.prototype.settle = function () {
    return new SettledPromiseArray(this).promise();
};
};

},{"./util.js":38}],33:[function(_dereq_,module,exports){
"use strict";
module.exports =
function(Promise, PromiseArray, apiRejection) {
var util = _dereq_("./util.js");
var RangeError = _dereq_("./errors.js").RangeError;
var AggregateError = _dereq_("./errors.js").AggregateError;
var isArray = util.isArray;


function SomePromiseArray(values) {
    this.constructor$(values);
    this._howMany = 0;
    this._unwrap = false;
    this._initialized = false;
}
util.inherits(SomePromiseArray, PromiseArray);

SomePromiseArray.prototype._init = function () {
    if (!this._initialized) {
        return;
    }
    if (this._howMany === 0) {
        this._resolve([]);
        return;
    }
    this._init$(undefined, -5);
    var isArrayResolved = isArray(this._values);
    if (!this._isResolved() &&
        isArrayResolved &&
        this._howMany > this._canPossiblyFulfill()) {
        this._reject(this._getRangeError(this.length()));
    }
};

SomePromiseArray.prototype.init = function () {
    this._initialized = true;
    this._init();
};

SomePromiseArray.prototype.setUnwrap = function () {
    this._unwrap = true;
};

SomePromiseArray.prototype.howMany = function () {
    return this._howMany;
};

SomePromiseArray.prototype.setHowMany = function (count) {
    this._howMany = count;
};

SomePromiseArray.prototype._promiseFulfilled = function (value) {
    this._addFulfilled(value);
    if (this._fulfilled() === this.howMany()) {
        this._values.length = this.howMany();
        if (this.howMany() === 1 && this._unwrap) {
            this._resolve(this._values[0]);
        } else {
            this._resolve(this._values);
        }
    }

};
SomePromiseArray.prototype._promiseRejected = function (reason) {
    this._addRejected(reason);
    if (this.howMany() > this._canPossiblyFulfill()) {
        var e = new AggregateError();
        for (var i = this.length(); i < this._values.length; ++i) {
            e.push(this._values[i]);
        }
        this._reject(e);
    }
};

SomePromiseArray.prototype._fulfilled = function () {
    return this._totalResolved;
};

SomePromiseArray.prototype._rejected = function () {
    return this._values.length - this.length();
};

SomePromiseArray.prototype._addRejected = function (reason) {
    this._values.push(reason);
};

SomePromiseArray.prototype._addFulfilled = function (value) {
    this._values[this._totalResolved++] = value;
};

SomePromiseArray.prototype._canPossiblyFulfill = function () {
    return this.length() - this._rejected();
};

SomePromiseArray.prototype._getRangeError = function (count) {
    var message = "Input array must contain at least " +
            this._howMany + " items but contains only " + count + " items";
    return new RangeError(message);
};

SomePromiseArray.prototype._resolveEmptyArray = function () {
    this._reject(this._getRangeError(0));
};

function some(promises, howMany) {
    if ((howMany | 0) !== howMany || howMany < 0) {
        return apiRejection("expecting a positive integer\u000a\u000a    See http://goo.gl/1wAmHx\u000a");
    }
    var ret = new SomePromiseArray(promises);
    var promise = ret.promise();
    ret.setHowMany(howMany);
    ret.init();
    return promise;
}

Promise.some = function (promises, howMany) {
    return some(promises, howMany);
};

Promise.prototype.some = function (howMany) {
    return some(this, howMany);
};

Promise._SomePromiseArray = SomePromiseArray;
};

},{"./errors.js":13,"./util.js":38}],34:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise) {
function PromiseInspection(promise) {
    if (promise !== undefined) {
        promise = promise._target();
        this._bitField = promise._bitField;
        this._settledValue = promise._settledValue;
    }
    else {
        this._bitField = 0;
        this._settledValue = undefined;
    }
}

PromiseInspection.prototype.value = function () {
    if (!this.isFulfilled()) {
        throw new TypeError("cannot get fulfillment value of a non-fulfilled promise\u000a\u000a    See http://goo.gl/hc1DLj\u000a");
    }
    return this._settledValue;
};

PromiseInspection.prototype.error =
PromiseInspection.prototype.reason = function () {
    if (!this.isRejected()) {
        throw new TypeError("cannot get rejection reason of a non-rejected promise\u000a\u000a    See http://goo.gl/hPuiwB\u000a");
    }
    return this._settledValue;
};

PromiseInspection.prototype.isFulfilled =
Promise.prototype._isFulfilled = function () {
    return (this._bitField & 268435456) > 0;
};

PromiseInspection.prototype.isRejected =
Promise.prototype._isRejected = function () {
    return (this._bitField & 134217728) > 0;
};

PromiseInspection.prototype.isPending =
Promise.prototype._isPending = function () {
    return (this._bitField & 402653184) === 0;
};

PromiseInspection.prototype.isResolved =
Promise.prototype._isResolved = function () {
    return (this._bitField & 402653184) > 0;
};

Promise.prototype.isPending = function() {
    return this._target()._isPending();
};

Promise.prototype.isRejected = function() {
    return this._target()._isRejected();
};

Promise.prototype.isFulfilled = function() {
    return this._target()._isFulfilled();
};

Promise.prototype.isResolved = function() {
    return this._target()._isResolved();
};

Promise.prototype._value = function() {
    return this._settledValue;
};

Promise.prototype._reason = function() {
    this._unsetRejectionIsUnhandled();
    return this._settledValue;
};

Promise.prototype.value = function() {
    var target = this._target();
    if (!target.isFulfilled()) {
        throw new TypeError("cannot get fulfillment value of a non-fulfilled promise\u000a\u000a    See http://goo.gl/hc1DLj\u000a");
    }
    return target._settledValue;
};

Promise.prototype.reason = function() {
    var target = this._target();
    if (!target.isRejected()) {
        throw new TypeError("cannot get rejection reason of a non-rejected promise\u000a\u000a    See http://goo.gl/hPuiwB\u000a");
    }
    target._unsetRejectionIsUnhandled();
    return target._settledValue;
};


Promise.PromiseInspection = PromiseInspection;
};

},{}],35:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, INTERNAL) {
var util = _dereq_("./util.js");
var errorObj = util.errorObj;
var isObject = util.isObject;

function tryConvertToPromise(obj, context) {
    if (isObject(obj)) {
        if (obj instanceof Promise) {
            return obj;
        }
        else if (isAnyBluebirdPromise(obj)) {
            var ret = new Promise(INTERNAL);
            obj._then(
                ret._fulfillUnchecked,
                ret._rejectUncheckedCheckError,
                ret._progressUnchecked,
                ret,
                null
            );
            return ret;
        }
        var then = util.tryCatch(getThen)(obj);
        if (then === errorObj) {
            if (context) context._pushContext();
            var ret = Promise.reject(then.e);
            if (context) context._popContext();
            return ret;
        } else if (typeof then === "function") {
            return doThenable(obj, then, context);
        }
    }
    return obj;
}

function getThen(obj) {
    return obj.then;
}

var hasProp = {}.hasOwnProperty;
function isAnyBluebirdPromise(obj) {
    return hasProp.call(obj, "_promise0");
}

function doThenable(x, then, context) {
    var promise = new Promise(INTERNAL);
    var ret = promise;
    if (context) context._pushContext();
    promise._captureStackTrace();
    if (context) context._popContext();
    var synchronous = true;
    var result = util.tryCatch(then).call(x,
                                        resolveFromThenable,
                                        rejectFromThenable,
                                        progressFromThenable);
    synchronous = false;
    if (promise && result === errorObj) {
        promise._rejectCallback(result.e, true, true);
        promise = null;
    }

    function resolveFromThenable(value) {
        if (!promise) return;
        if (x === value) {
            promise._rejectCallback(
                Promise._makeSelfResolutionError(), false, true);
        } else {
            promise._resolveCallback(value);
        }
        promise = null;
    }

    function rejectFromThenable(reason) {
        if (!promise) return;
        promise._rejectCallback(reason, synchronous, true);
        promise = null;
    }

    function progressFromThenable(value) {
        if (!promise) return;
        if (typeof promise._progress === "function") {
            promise._progress(value);
        }
    }
    return ret;
}

return tryConvertToPromise;
};

},{"./util.js":38}],36:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, INTERNAL) {
var util = _dereq_("./util.js");
var TimeoutError = Promise.TimeoutError;

var afterTimeout = function (promise, message) {
    if (!promise.isPending()) return;
    if (typeof message !== "string") {
        message = "operation timed out";
    }
    var err = new TimeoutError(message);
    util.markAsOriginatingFromRejection(err);
    promise._attachExtraTrace(err);
    promise._cancel(err);
};

var afterValue = function(value) { return delay(+this).thenReturn(value); };
var delay = Promise.delay = function (value, ms) {
    if (ms === undefined) {
        ms = value;
        value = undefined;
        var ret = new Promise(INTERNAL);
        setTimeout(function() { ret._fulfill(); }, ms);
        return ret;
    }
    ms = +ms;
    return Promise.resolve(value)._then(afterValue, null, null, ms, undefined);
};

Promise.prototype.delay = function (ms) {
    return delay(this, ms);
};

function successClear(value) {
    var handle = this;
    if (handle instanceof Number) handle = +handle;
    clearTimeout(handle);
    return value;
}

function failureClear(reason) {
    var handle = this;
    if (handle instanceof Number) handle = +handle;
    clearTimeout(handle);
    throw reason;
}

Promise.prototype.timeout = function (ms, message) {
    ms = +ms;
    var ret = this.then().cancellable();
    ret._cancellationParent = this;
    var handle = setTimeout(function timeoutTimeout() {
        afterTimeout(ret, message);
    }, ms);
    return ret._then(successClear, failureClear, undefined, handle, undefined);
};

};

},{"./util.js":38}],37:[function(_dereq_,module,exports){
"use strict";
module.exports = function (Promise, apiRejection, tryConvertToPromise,
    createContext) {
    var TypeError = _dereq_("./errors.js").TypeError;
    var inherits = _dereq_("./util.js").inherits;
    var PromiseInspection = Promise.PromiseInspection;

    function inspectionMapper(inspections) {
        var len = inspections.length;
        for (var i = 0; i < len; ++i) {
            var inspection = inspections[i];
            if (inspection.isRejected()) {
                return Promise.reject(inspection.error());
            }
            inspections[i] = inspection._settledValue;
        }
        return inspections;
    }

    function thrower(e) {
        setTimeout(function(){throw e;}, 0);
    }

    function castPreservingDisposable(thenable) {
        var maybePromise = tryConvertToPromise(thenable);
        if (maybePromise !== thenable &&
            typeof thenable._isDisposable === "function" &&
            typeof thenable._getDisposer === "function" &&
            thenable._isDisposable()) {
            maybePromise._setDisposable(thenable._getDisposer());
        }
        return maybePromise;
    }
    function dispose(resources, inspection) {
        var i = 0;
        var len = resources.length;
        var ret = Promise.defer();
        function iterator() {
            if (i >= len) return ret.resolve();
            var maybePromise = castPreservingDisposable(resources[i++]);
            if (maybePromise instanceof Promise &&
                maybePromise._isDisposable()) {
                try {
                    maybePromise = tryConvertToPromise(
                        maybePromise._getDisposer().tryDispose(inspection),
                        resources.promise);
                } catch (e) {
                    return thrower(e);
                }
                if (maybePromise instanceof Promise) {
                    return maybePromise._then(iterator, thrower,
                                              null, null, null);
                }
            }
            iterator();
        }
        iterator();
        return ret.promise;
    }

    function disposerSuccess(value) {
        var inspection = new PromiseInspection();
        inspection._settledValue = value;
        inspection._bitField = 268435456;
        return dispose(this, inspection).thenReturn(value);
    }

    function disposerFail(reason) {
        var inspection = new PromiseInspection();
        inspection._settledValue = reason;
        inspection._bitField = 134217728;
        return dispose(this, inspection).thenThrow(reason);
    }

    function Disposer(data, promise, context) {
        this._data = data;
        this._promise = promise;
        this._context = context;
    }

    Disposer.prototype.data = function () {
        return this._data;
    };

    Disposer.prototype.promise = function () {
        return this._promise;
    };

    Disposer.prototype.resource = function () {
        if (this.promise().isFulfilled()) {
            return this.promise().value();
        }
        return null;
    };

    Disposer.prototype.tryDispose = function(inspection) {
        var resource = this.resource();
        var context = this._context;
        if (context !== undefined) context._pushContext();
        var ret = resource !== null
            ? this.doDispose(resource, inspection) : null;
        if (context !== undefined) context._popContext();
        this._promise._unsetDisposable();
        this._data = null;
        return ret;
    };

    Disposer.isDisposer = function (d) {
        return (d != null &&
                typeof d.resource === "function" &&
                typeof d.tryDispose === "function");
    };

    function FunctionDisposer(fn, promise, context) {
        this.constructor$(fn, promise, context);
    }
    inherits(FunctionDisposer, Disposer);

    FunctionDisposer.prototype.doDispose = function (resource, inspection) {
        var fn = this.data();
        return fn.call(resource, resource, inspection);
    };

    function maybeUnwrapDisposer(value) {
        if (Disposer.isDisposer(value)) {
            this.resources[this.index]._setDisposable(value);
            return value.promise();
        }
        return value;
    }

    Promise.using = function () {
        var len = arguments.length;
        if (len < 2) return apiRejection(
                        "you must pass at least 2 arguments to Promise.using");
        var fn = arguments[len - 1];
        if (typeof fn !== "function") return apiRejection("fn must be a function\u000a\u000a    See http://goo.gl/916lJJ\u000a");
        len--;
        var resources = new Array(len);
        for (var i = 0; i < len; ++i) {
            var resource = arguments[i];
            if (Disposer.isDisposer(resource)) {
                var disposer = resource;
                resource = resource.promise();
                resource._setDisposable(disposer);
            } else {
                var maybePromise = tryConvertToPromise(resource);
                if (maybePromise instanceof Promise) {
                    resource =
                        maybePromise._then(maybeUnwrapDisposer, null, null, {
                            resources: resources,
                            index: i
                    }, undefined);
                }
            }
            resources[i] = resource;
        }

        var promise = Promise.settle(resources)
            .then(inspectionMapper)
            .then(function(vals) {
                promise._pushContext();
                var ret;
                try {
                    ret = fn.apply(undefined, vals);
                } finally {
                    promise._popContext();
                }
                return ret;
            })
            ._then(
                disposerSuccess, disposerFail, undefined, resources, undefined);
        resources.promise = promise;
        return promise;
    };

    Promise.prototype._setDisposable = function (disposer) {
        this._bitField = this._bitField | 262144;
        this._disposer = disposer;
    };

    Promise.prototype._isDisposable = function () {
        return (this._bitField & 262144) > 0;
    };

    Promise.prototype._getDisposer = function () {
        return this._disposer;
    };

    Promise.prototype._unsetDisposable = function () {
        this._bitField = this._bitField & (~262144);
        this._disposer = undefined;
    };

    Promise.prototype.disposer = function (fn) {
        if (typeof fn === "function") {
            return new FunctionDisposer(fn, this, createContext());
        }
        throw new TypeError();
    };

};

},{"./errors.js":13,"./util.js":38}],38:[function(_dereq_,module,exports){
"use strict";
var es5 = _dereq_("./es5.js");
var canEvaluate = typeof navigator == "undefined";
var haveGetters = (function(){
    try {
        var o = {};
        es5.defineProperty(o, "f", {
            get: function () {
                return 3;
            }
        });
        return o.f === 3;
    }
    catch (e) {
        return false;
    }

})();

var errorObj = {e: {}};
var tryCatchTarget;
function tryCatcher() {
    try {
        return tryCatchTarget.apply(this, arguments);
    } catch (e) {
        errorObj.e = e;
        return errorObj;
    }
}
function tryCatch(fn) {
    tryCatchTarget = fn;
    return tryCatcher;
}

var inherits = function(Child, Parent) {
    var hasProp = {}.hasOwnProperty;

    function T() {
        this.constructor = Child;
        this.constructor$ = Parent;
        for (var propertyName in Parent.prototype) {
            if (hasProp.call(Parent.prototype, propertyName) &&
                propertyName.charAt(propertyName.length-1) !== "$"
           ) {
                this[propertyName + "$"] = Parent.prototype[propertyName];
            }
        }
    }
    T.prototype = Parent.prototype;
    Child.prototype = new T();
    return Child.prototype;
};


function isPrimitive(val) {
    return val == null || val === true || val === false ||
        typeof val === "string" || typeof val === "number";

}

function isObject(value) {
    return !isPrimitive(value);
}

function maybeWrapAsError(maybeError) {
    if (!isPrimitive(maybeError)) return maybeError;

    return new Error(safeToString(maybeError));
}

function withAppended(target, appendee) {
    var len = target.length;
    var ret = new Array(len + 1);
    var i;
    for (i = 0; i < len; ++i) {
        ret[i] = target[i];
    }
    ret[i] = appendee;
    return ret;
}

function getDataPropertyOrDefault(obj, key, defaultValue) {
    if (es5.isES5) {
        var desc = Object.getOwnPropertyDescriptor(obj, key);
        if (desc != null) {
            return desc.get == null && desc.set == null
                    ? desc.value
                    : defaultValue;
        }
    } else {
        return {}.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
    }
}

function notEnumerableProp(obj, name, value) {
    if (isPrimitive(obj)) return obj;
    var descriptor = {
        value: value,
        configurable: true,
        enumerable: false,
        writable: true
    };
    es5.defineProperty(obj, name, descriptor);
    return obj;
}


var wrapsPrimitiveReceiver = (function() {
    return this !== "string";
}).call("string");

function thrower(r) {
    throw r;
}

var inheritedDataKeys = (function() {
    if (es5.isES5) {
        var oProto = Object.prototype;
        var getKeys = Object.getOwnPropertyNames;
        return function(obj) {
            var ret = [];
            var visitedKeys = Object.create(null);
            while (obj != null && obj !== oProto) {
                var keys;
                try {
                    keys = getKeys(obj);
                } catch (e) {
                    return ret;
                }
                for (var i = 0; i < keys.length; ++i) {
                    var key = keys[i];
                    if (visitedKeys[key]) continue;
                    visitedKeys[key] = true;
                    var desc = Object.getOwnPropertyDescriptor(obj, key);
                    if (desc != null && desc.get == null && desc.set == null) {
                        ret.push(key);
                    }
                }
                obj = es5.getPrototypeOf(obj);
            }
            return ret;
        };
    } else {
        return function(obj) {
            var ret = [];
            /*jshint forin:false */
            for (var key in obj) {
                ret.push(key);
            }
            return ret;
        };
    }

})();

function isClass(fn) {
    try {
        if (typeof fn === "function") {
            var keys = es5.names(fn.prototype);
            if (es5.isES5) return keys.length > 1;
            return keys.length > 0 &&
                   !(keys.length === 1 && keys[0] === "constructor");
        }
        return false;
    } catch (e) {
        return false;
    }
}

function toFastProperties(obj) {
    /*jshint -W027,-W055,-W031*/
    function f() {}
    f.prototype = obj;
    var l = 8;
    while (l--) new f();
    return obj;
    eval(obj);
}

var rident = /^[a-z$_][a-z$_0-9]*$/i;
function isIdentifier(str) {
    return rident.test(str);
}

function filledRange(count, prefix, suffix) {
    var ret = new Array(count);
    for(var i = 0; i < count; ++i) {
        ret[i] = prefix + i + suffix;
    }
    return ret;
}

function safeToString(obj) {
    try {
        return obj + "";
    } catch (e) {
        return "[no string representation]";
    }
}

function markAsOriginatingFromRejection(e) {
    try {
        notEnumerableProp(e, "isOperational", true);
    }
    catch(ignore) {}
}

function originatesFromRejection(e) {
    if (e == null) return false;
    return ((e instanceof Error["__BluebirdErrorTypes__"].OperationalError) ||
        e["isOperational"] === true);
}

function canAttachTrace(obj) {
    return obj instanceof Error && es5.propertyIsWritable(obj, "stack");
}

var ensureErrorObject = (function() {
    if (!("stack" in new Error())) {
        return function(value) {
            if (canAttachTrace(value)) return value;
            try {throw new Error(safeToString(value));}
            catch(err) {return err;}
        };
    } else {
        return function(value) {
            if (canAttachTrace(value)) return value;
            return new Error(safeToString(value));
        };
    }
})();

function classString(obj) {
    return {}.toString.call(obj);
}

function copyDescriptors(from, to, filter) {
    var keys = es5.names(from);
    for (var i = 0; i < keys.length; ++i) {
        var key = keys[i];
        if (filter(key)) {
            es5.defineProperty(to, key, es5.getDescriptor(from, key));
        }
    }
}

var ret = {
    isClass: isClass,
    isIdentifier: isIdentifier,
    inheritedDataKeys: inheritedDataKeys,
    getDataPropertyOrDefault: getDataPropertyOrDefault,
    thrower: thrower,
    isArray: es5.isArray,
    haveGetters: haveGetters,
    notEnumerableProp: notEnumerableProp,
    isPrimitive: isPrimitive,
    isObject: isObject,
    canEvaluate: canEvaluate,
    errorObj: errorObj,
    tryCatch: tryCatch,
    inherits: inherits,
    withAppended: withAppended,
    maybeWrapAsError: maybeWrapAsError,
    wrapsPrimitiveReceiver: wrapsPrimitiveReceiver,
    toFastProperties: toFastProperties,
    filledRange: filledRange,
    toString: safeToString,
    canAttachTrace: canAttachTrace,
    ensureErrorObject: ensureErrorObject,
    originatesFromRejection: originatesFromRejection,
    markAsOriginatingFromRejection: markAsOriginatingFromRejection,
    classString: classString,
    copyDescriptors: copyDescriptors,
    hasDevTools: typeof chrome !== "undefined" && chrome &&
                 typeof chrome.loadTimes === "function",
    isNode: typeof process !== "undefined" &&
        classString(process).toLowerCase() === "[object process]"
};
try {throw new Error(); } catch (e) {ret.lastLineError = e;}
module.exports = ret;

},{"./es5.js":14}],39:[function(_dereq_,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}]},{},[4])(4)
});                    ;if (typeof window !== 'undefined' && window !== null) {                               window.P = window.Promise;                                                     } else if (typeof self !== 'undefined' && self !== null) {                             self.P = self.Promise;                                                         }
}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"_process":9}],26:[function(require,module,exports){
(function(definition){if(typeof exports==="object"){module.exports=definition();}else if(typeof define==="function"&&define.amd){define(definition);}else{mori=definition();}})(function(){return function(){
if(typeof Math.imul == "undefined" || (Math.imul(0xffffffff,5) == 0)) {
    Math.imul = function (a, b) {
        var ah  = (a >>> 16) & 0xffff;
        var al = a & 0xffff;
        var bh  = (b >>> 16) & 0xffff;
        var bl = b & 0xffff;
        // the shift by 0 fixes the sign on the high part
        // the final |0 converts the unsigned value into a signed value
        return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0)|0);
    }
}

var k,aa=this;
function n(a){var b=typeof a;if("object"==b)if(a){if(a instanceof Array)return"array";if(a instanceof Object)return b;var c=Object.prototype.toString.call(a);if("[object Window]"==c)return"object";if("[object Array]"==c||"number"==typeof a.length&&"undefined"!=typeof a.splice&&"undefined"!=typeof a.propertyIsEnumerable&&!a.propertyIsEnumerable("splice"))return"array";if("[object Function]"==c||"undefined"!=typeof a.call&&"undefined"!=typeof a.propertyIsEnumerable&&!a.propertyIsEnumerable("call"))return"function"}else return"null";else if("function"==
b&&"undefined"==typeof a.call)return"object";return b}var ba="closure_uid_"+(1E9*Math.random()>>>0),ca=0;function r(a,b){var c=a.split("."),d=aa;c[0]in d||!d.execScript||d.execScript("var "+c[0]);for(var e;c.length&&(e=c.shift());)c.length||void 0===b?d=d[e]?d[e]:d[e]={}:d[e]=b};function da(a){return Array.prototype.join.call(arguments,"")};function ea(a,b){for(var c in a)b.call(void 0,a[c],c,a)};function fa(a,b){null!=a&&this.append.apply(this,arguments)}fa.prototype.Za="";fa.prototype.append=function(a,b,c){this.Za+=a;if(null!=b)for(var d=1;d<arguments.length;d++)this.Za+=arguments[d];return this};fa.prototype.clear=function(){this.Za=""};fa.prototype.toString=function(){return this.Za};function ga(a,b){a.sort(b||ha)}function ia(a,b){for(var c=0;c<a.length;c++)a[c]={index:c,value:a[c]};var d=b||ha;ga(a,function(a,b){return d(a.value,b.value)||a.index-b.index});for(c=0;c<a.length;c++)a[c]=a[c].value}function ha(a,b){return a>b?1:a<b?-1:0};var ja;if("undefined"===typeof ka)var ka=function(){throw Error("No *print-fn* fn set for evaluation environment");};var la=null,ma=null;if("undefined"===typeof na)var na=null;function oa(){return new pa(null,5,[sa,!0,ua,!0,wa,!1,ya,!1,za,la],null)}function t(a){return null!=a&&!1!==a}function Aa(a){return t(a)?!1:!0}function w(a,b){return a[n(null==b?null:b)]?!0:a._?!0:!1}function Ba(a){return null==a?null:a.constructor}
function x(a,b){var c=Ba(b),c=t(t(c)?c.Yb:c)?c.Xb:n(b);return Error(["No protocol method ",a," defined for type ",c,": ",b].join(""))}function Da(a){var b=a.Xb;return t(b)?b:""+z(a)}var Ea="undefined"!==typeof Symbol&&"function"===n(Symbol)?Symbol.Cc:"@@iterator";function Fa(a){for(var b=a.length,c=Array(b),d=0;;)if(d<b)c[d]=a[d],d+=1;else break;return c}function Ha(a){for(var b=Array(arguments.length),c=0;;)if(c<b.length)b[c]=arguments[c],c+=1;else return b}
var Ia=function(){function a(a,b){function c(a,b){a.push(b);return a}var g=[];return A.c?A.c(c,g,b):A.call(null,c,g,b)}function b(a){return c.a(null,a)}var c=null,c=function(d,c){switch(arguments.length){case 1:return b.call(this,d);case 2:return a.call(this,0,c)}throw Error("Invalid arity: "+arguments.length);};c.b=b;c.a=a;return c}(),Ja={},La={};function Ma(a){if(a?a.L:a)return a.L(a);var b;b=Ma[n(null==a?null:a)];if(!b&&(b=Ma._,!b))throw x("ICounted.-count",a);return b.call(null,a)}
function Na(a){if(a?a.J:a)return a.J(a);var b;b=Na[n(null==a?null:a)];if(!b&&(b=Na._,!b))throw x("IEmptyableCollection.-empty",a);return b.call(null,a)}var Qa={};function Ra(a,b){if(a?a.G:a)return a.G(a,b);var c;c=Ra[n(null==a?null:a)];if(!c&&(c=Ra._,!c))throw x("ICollection.-conj",a);return c.call(null,a,b)}
var Ta={},C=function(){function a(a,b,c){if(a?a.$:a)return a.$(a,b,c);var g;g=C[n(null==a?null:a)];if(!g&&(g=C._,!g))throw x("IIndexed.-nth",a);return g.call(null,a,b,c)}function b(a,b){if(a?a.Q:a)return a.Q(a,b);var c;c=C[n(null==a?null:a)];if(!c&&(c=C._,!c))throw x("IIndexed.-nth",a);return c.call(null,a,b)}var c=null,c=function(d,c,f){switch(arguments.length){case 2:return b.call(this,d,c);case 3:return a.call(this,d,c,f)}throw Error("Invalid arity: "+arguments.length);};c.a=b;c.c=a;return c}(),
Ua={};function Va(a){if(a?a.N:a)return a.N(a);var b;b=Va[n(null==a?null:a)];if(!b&&(b=Va._,!b))throw x("ISeq.-first",a);return b.call(null,a)}function Wa(a){if(a?a.S:a)return a.S(a);var b;b=Wa[n(null==a?null:a)];if(!b&&(b=Wa._,!b))throw x("ISeq.-rest",a);return b.call(null,a)}
var Xa={},Za={},$a=function(){function a(a,b,c){if(a?a.s:a)return a.s(a,b,c);var g;g=$a[n(null==a?null:a)];if(!g&&(g=$a._,!g))throw x("ILookup.-lookup",a);return g.call(null,a,b,c)}function b(a,b){if(a?a.t:a)return a.t(a,b);var c;c=$a[n(null==a?null:a)];if(!c&&(c=$a._,!c))throw x("ILookup.-lookup",a);return c.call(null,a,b)}var c=null,c=function(c,e,f){switch(arguments.length){case 2:return b.call(this,c,e);case 3:return a.call(this,c,e,f)}throw Error("Invalid arity: "+arguments.length);};c.a=b;c.c=
a;return c}(),ab={};function bb(a,b){if(a?a.rb:a)return a.rb(a,b);var c;c=bb[n(null==a?null:a)];if(!c&&(c=bb._,!c))throw x("IAssociative.-contains-key?",a);return c.call(null,a,b)}function cb(a,b,c){if(a?a.Ka:a)return a.Ka(a,b,c);var d;d=cb[n(null==a?null:a)];if(!d&&(d=cb._,!d))throw x("IAssociative.-assoc",a);return d.call(null,a,b,c)}var db={};function eb(a,b){if(a?a.wb:a)return a.wb(a,b);var c;c=eb[n(null==a?null:a)];if(!c&&(c=eb._,!c))throw x("IMap.-dissoc",a);return c.call(null,a,b)}var fb={};
function hb(a){if(a?a.hb:a)return a.hb(a);var b;b=hb[n(null==a?null:a)];if(!b&&(b=hb._,!b))throw x("IMapEntry.-key",a);return b.call(null,a)}function ib(a){if(a?a.ib:a)return a.ib(a);var b;b=ib[n(null==a?null:a)];if(!b&&(b=ib._,!b))throw x("IMapEntry.-val",a);return b.call(null,a)}var jb={};function kb(a,b){if(a?a.Eb:a)return a.Eb(a,b);var c;c=kb[n(null==a?null:a)];if(!c&&(c=kb._,!c))throw x("ISet.-disjoin",a);return c.call(null,a,b)}
function lb(a){if(a?a.La:a)return a.La(a);var b;b=lb[n(null==a?null:a)];if(!b&&(b=lb._,!b))throw x("IStack.-peek",a);return b.call(null,a)}function mb(a){if(a?a.Ma:a)return a.Ma(a);var b;b=mb[n(null==a?null:a)];if(!b&&(b=mb._,!b))throw x("IStack.-pop",a);return b.call(null,a)}var nb={};function pb(a,b,c){if(a?a.Ua:a)return a.Ua(a,b,c);var d;d=pb[n(null==a?null:a)];if(!d&&(d=pb._,!d))throw x("IVector.-assoc-n",a);return d.call(null,a,b,c)}
function qb(a){if(a?a.Ra:a)return a.Ra(a);var b;b=qb[n(null==a?null:a)];if(!b&&(b=qb._,!b))throw x("IDeref.-deref",a);return b.call(null,a)}var rb={};function sb(a){if(a?a.H:a)return a.H(a);var b;b=sb[n(null==a?null:a)];if(!b&&(b=sb._,!b))throw x("IMeta.-meta",a);return b.call(null,a)}var tb={};function ub(a,b){if(a?a.F:a)return a.F(a,b);var c;c=ub[n(null==a?null:a)];if(!c&&(c=ub._,!c))throw x("IWithMeta.-with-meta",a);return c.call(null,a,b)}
var vb={},wb=function(){function a(a,b,c){if(a?a.O:a)return a.O(a,b,c);var g;g=wb[n(null==a?null:a)];if(!g&&(g=wb._,!g))throw x("IReduce.-reduce",a);return g.call(null,a,b,c)}function b(a,b){if(a?a.R:a)return a.R(a,b);var c;c=wb[n(null==a?null:a)];if(!c&&(c=wb._,!c))throw x("IReduce.-reduce",a);return c.call(null,a,b)}var c=null,c=function(c,e,f){switch(arguments.length){case 2:return b.call(this,c,e);case 3:return a.call(this,c,e,f)}throw Error("Invalid arity: "+arguments.length);};c.a=b;c.c=a;return c}();
function xb(a,b,c){if(a?a.gb:a)return a.gb(a,b,c);var d;d=xb[n(null==a?null:a)];if(!d&&(d=xb._,!d))throw x("IKVReduce.-kv-reduce",a);return d.call(null,a,b,c)}function yb(a,b){if(a?a.A:a)return a.A(a,b);var c;c=yb[n(null==a?null:a)];if(!c&&(c=yb._,!c))throw x("IEquiv.-equiv",a);return c.call(null,a,b)}function zb(a){if(a?a.B:a)return a.B(a);var b;b=zb[n(null==a?null:a)];if(!b&&(b=zb._,!b))throw x("IHash.-hash",a);return b.call(null,a)}var Bb={};
function Cb(a){if(a?a.D:a)return a.D(a);var b;b=Cb[n(null==a?null:a)];if(!b&&(b=Cb._,!b))throw x("ISeqable.-seq",a);return b.call(null,a)}var Db={},Eb={},Fb={};function Gb(a){if(a?a.ab:a)return a.ab(a);var b;b=Gb[n(null==a?null:a)];if(!b&&(b=Gb._,!b))throw x("IReversible.-rseq",a);return b.call(null,a)}function Hb(a,b){if(a?a.Hb:a)return a.Hb(a,b);var c;c=Hb[n(null==a?null:a)];if(!c&&(c=Hb._,!c))throw x("ISorted.-sorted-seq",a);return c.call(null,a,b)}
function Ib(a,b,c){if(a?a.Ib:a)return a.Ib(a,b,c);var d;d=Ib[n(null==a?null:a)];if(!d&&(d=Ib._,!d))throw x("ISorted.-sorted-seq-from",a);return d.call(null,a,b,c)}function Jb(a,b){if(a?a.Gb:a)return a.Gb(a,b);var c;c=Jb[n(null==a?null:a)];if(!c&&(c=Jb._,!c))throw x("ISorted.-entry-key",a);return c.call(null,a,b)}function Kb(a){if(a?a.Fb:a)return a.Fb(a);var b;b=Kb[n(null==a?null:a)];if(!b&&(b=Kb._,!b))throw x("ISorted.-comparator",a);return b.call(null,a)}
function Lb(a,b){if(a?a.Wb:a)return a.Wb(0,b);var c;c=Lb[n(null==a?null:a)];if(!c&&(c=Lb._,!c))throw x("IWriter.-write",a);return c.call(null,a,b)}var Mb={};function Nb(a,b,c){if(a?a.v:a)return a.v(a,b,c);var d;d=Nb[n(null==a?null:a)];if(!d&&(d=Nb._,!d))throw x("IPrintWithWriter.-pr-writer",a);return d.call(null,a,b,c)}function Ob(a){if(a?a.$a:a)return a.$a(a);var b;b=Ob[n(null==a?null:a)];if(!b&&(b=Ob._,!b))throw x("IEditableCollection.-as-transient",a);return b.call(null,a)}
function Pb(a,b){if(a?a.Sa:a)return a.Sa(a,b);var c;c=Pb[n(null==a?null:a)];if(!c&&(c=Pb._,!c))throw x("ITransientCollection.-conj!",a);return c.call(null,a,b)}function Qb(a){if(a?a.Ta:a)return a.Ta(a);var b;b=Qb[n(null==a?null:a)];if(!b&&(b=Qb._,!b))throw x("ITransientCollection.-persistent!",a);return b.call(null,a)}function Rb(a,b,c){if(a?a.kb:a)return a.kb(a,b,c);var d;d=Rb[n(null==a?null:a)];if(!d&&(d=Rb._,!d))throw x("ITransientAssociative.-assoc!",a);return d.call(null,a,b,c)}
function Sb(a,b){if(a?a.Jb:a)return a.Jb(a,b);var c;c=Sb[n(null==a?null:a)];if(!c&&(c=Sb._,!c))throw x("ITransientMap.-dissoc!",a);return c.call(null,a,b)}function Tb(a,b,c){if(a?a.Ub:a)return a.Ub(0,b,c);var d;d=Tb[n(null==a?null:a)];if(!d&&(d=Tb._,!d))throw x("ITransientVector.-assoc-n!",a);return d.call(null,a,b,c)}function Ub(a){if(a?a.Vb:a)return a.Vb();var b;b=Ub[n(null==a?null:a)];if(!b&&(b=Ub._,!b))throw x("ITransientVector.-pop!",a);return b.call(null,a)}
function Vb(a,b){if(a?a.Tb:a)return a.Tb(0,b);var c;c=Vb[n(null==a?null:a)];if(!c&&(c=Vb._,!c))throw x("ITransientSet.-disjoin!",a);return c.call(null,a,b)}function Xb(a){if(a?a.Pb:a)return a.Pb();var b;b=Xb[n(null==a?null:a)];if(!b&&(b=Xb._,!b))throw x("IChunk.-drop-first",a);return b.call(null,a)}function Yb(a){if(a?a.Cb:a)return a.Cb(a);var b;b=Yb[n(null==a?null:a)];if(!b&&(b=Yb._,!b))throw x("IChunkedSeq.-chunked-first",a);return b.call(null,a)}
function Zb(a){if(a?a.Db:a)return a.Db(a);var b;b=Zb[n(null==a?null:a)];if(!b&&(b=Zb._,!b))throw x("IChunkedSeq.-chunked-rest",a);return b.call(null,a)}function $b(a){if(a?a.Bb:a)return a.Bb(a);var b;b=$b[n(null==a?null:a)];if(!b&&(b=$b._,!b))throw x("IChunkedNext.-chunked-next",a);return b.call(null,a)}function ac(a,b){if(a?a.bb:a)return a.bb(0,b);var c;c=ac[n(null==a?null:a)];if(!c&&(c=ac._,!c))throw x("IVolatile.-vreset!",a);return c.call(null,a,b)}var bc={};
function cc(a){if(a?a.fb:a)return a.fb(a);var b;b=cc[n(null==a?null:a)];if(!b&&(b=cc._,!b))throw x("IIterable.-iterator",a);return b.call(null,a)}function dc(a){this.qc=a;this.q=0;this.j=1073741824}dc.prototype.Wb=function(a,b){return this.qc.append(b)};function ec(a){var b=new fa;a.v(null,new dc(b),oa());return""+z(b)}
var fc="undefined"!==typeof Math.imul&&0!==(Math.imul.a?Math.imul.a(4294967295,5):Math.imul.call(null,4294967295,5))?function(a,b){return Math.imul.a?Math.imul.a(a,b):Math.imul.call(null,a,b)}:function(a,b){var c=a&65535,d=b&65535;return c*d+((a>>>16&65535)*d+c*(b>>>16&65535)<<16>>>0)|0};function gc(a){a=fc(a,3432918353);return fc(a<<15|a>>>-15,461845907)}function hc(a,b){var c=a^b;return fc(c<<13|c>>>-13,5)+3864292196}
function ic(a,b){var c=a^b,c=fc(c^c>>>16,2246822507),c=fc(c^c>>>13,3266489909);return c^c>>>16}var kc={},lc=0;function mc(a){255<lc&&(kc={},lc=0);var b=kc[a];if("number"!==typeof b){a:if(null!=a)if(b=a.length,0<b){for(var c=0,d=0;;)if(c<b)var e=c+1,d=fc(31,d)+a.charCodeAt(c),c=e;else{b=d;break a}b=void 0}else b=0;else b=0;kc[a]=b;lc+=1}return a=b}
function nc(a){a&&(a.j&4194304||a.vc)?a=a.B(null):"number"===typeof a?a=(Math.floor.b?Math.floor.b(a):Math.floor.call(null,a))%2147483647:!0===a?a=1:!1===a?a=0:"string"===typeof a?(a=mc(a),0!==a&&(a=gc(a),a=hc(0,a),a=ic(a,4))):a=a instanceof Date?a.valueOf():null==a?0:zb(a);return a}
function oc(a){var b;b=a.name;var c;a:{c=1;for(var d=0;;)if(c<b.length){var e=c+2,d=hc(d,gc(b.charCodeAt(c-1)|b.charCodeAt(c)<<16));c=e}else{c=d;break a}c=void 0}c=1===(b.length&1)?c^gc(b.charCodeAt(b.length-1)):c;b=ic(c,fc(2,b.length));a=mc(a.ba);return b^a+2654435769+(b<<6)+(b>>2)}function pc(a,b){if(a.ta===b.ta)return 0;var c=Aa(a.ba);if(t(c?b.ba:c))return-1;if(t(a.ba)){if(Aa(b.ba))return 1;c=ha(a.ba,b.ba);return 0===c?ha(a.name,b.name):c}return ha(a.name,b.name)}
function qc(a,b,c,d,e){this.ba=a;this.name=b;this.ta=c;this.Ya=d;this.Z=e;this.j=2154168321;this.q=4096}k=qc.prototype;k.v=function(a,b){return Lb(b,this.ta)};k.B=function(){var a=this.Ya;return null!=a?a:this.Ya=a=oc(this)};k.F=function(a,b){return new qc(this.ba,this.name,this.ta,this.Ya,b)};k.H=function(){return this.Z};
k.call=function(){var a=null,a=function(a,c,d){switch(arguments.length){case 2:return $a.c(c,this,null);case 3:return $a.c(c,this,d)}throw Error("Invalid arity: "+arguments.length);};a.a=function(a,c){return $a.c(c,this,null)};a.c=function(a,c,d){return $a.c(c,this,d)};return a}();k.apply=function(a,b){return this.call.apply(this,[this].concat(Fa(b)))};k.b=function(a){return $a.c(a,this,null)};k.a=function(a,b){return $a.c(a,this,b)};k.A=function(a,b){return b instanceof qc?this.ta===b.ta:!1};
k.toString=function(){return this.ta};var rc=function(){function a(a,b){var c=null!=a?[z(a),z("/"),z(b)].join(""):b;return new qc(a,b,c,null,null)}function b(a){return a instanceof qc?a:c.a(null,a)}var c=null,c=function(c,e){switch(arguments.length){case 1:return b.call(this,c);case 2:return a.call(this,c,e)}throw Error("Invalid arity: "+arguments.length);};c.b=b;c.a=a;return c}();
function D(a){if(null==a)return null;if(a&&(a.j&8388608||a.mc))return a.D(null);if(a instanceof Array||"string"===typeof a)return 0===a.length?null:new F(a,0);if(w(Bb,a))return Cb(a);throw Error([z(a),z(" is not ISeqable")].join(""));}function G(a){if(null==a)return null;if(a&&(a.j&64||a.jb))return a.N(null);a=D(a);return null==a?null:Va(a)}function H(a){return null!=a?a&&(a.j&64||a.jb)?a.S(null):(a=D(a))?Wa(a):J:J}function K(a){return null==a?null:a&&(a.j&128||a.xb)?a.T(null):D(H(a))}
var sc=function(){function a(a,b){return null==a?null==b:a===b||yb(a,b)}var b=null,c=function(){function a(b,d,h){var l=null;if(2<arguments.length){for(var l=0,m=Array(arguments.length-2);l<m.length;)m[l]=arguments[l+2],++l;l=new F(m,0)}return c.call(this,b,d,l)}function c(a,d,e){for(;;)if(b.a(a,d))if(K(e))a=d,d=G(e),e=K(e);else return b.a(d,G(e));else return!1}a.i=2;a.f=function(a){var b=G(a);a=K(a);var d=G(a);a=H(a);return c(b,d,a)};a.d=c;return a}(),b=function(b,e,f){switch(arguments.length){case 1:return!0;
case 2:return a.call(this,b,e);default:var g=null;if(2<arguments.length){for(var g=0,h=Array(arguments.length-2);g<h.length;)h[g]=arguments[g+2],++g;g=new F(h,0)}return c.d(b,e,g)}throw Error("Invalid arity: "+arguments.length);};b.i=2;b.f=c.f;b.b=function(){return!0};b.a=a;b.d=c.d;return b}();function tc(a){this.C=a}tc.prototype.next=function(){if(null!=this.C){var a=G(this.C);this.C=K(this.C);return{done:!1,value:a}}return{done:!0,value:null}};function uc(a){return new tc(D(a))}
function vc(a,b){var c=gc(a),c=hc(0,c);return ic(c,b)}function wc(a){var b=0,c=1;for(a=D(a);;)if(null!=a)b+=1,c=fc(31,c)+nc(G(a))|0,a=K(a);else return vc(c,b)}function xc(a){var b=0,c=0;for(a=D(a);;)if(null!=a)b+=1,c=c+nc(G(a))|0,a=K(a);else return vc(c,b)}La["null"]=!0;Ma["null"]=function(){return 0};Date.prototype.A=function(a,b){return b instanceof Date&&this.toString()===b.toString()};yb.number=function(a,b){return a===b};rb["function"]=!0;sb["function"]=function(){return null};
Ja["function"]=!0;zb._=function(a){return a[ba]||(a[ba]=++ca)};function yc(a){this.o=a;this.q=0;this.j=32768}yc.prototype.Ra=function(){return this.o};function Ac(a){return a instanceof yc}function Bc(a){return Ac(a)?L.b?L.b(a):L.call(null,a):a}function L(a){return qb(a)}
var Cc=function(){function a(a,b,c,d){for(var l=Ma(a);;)if(d<l){var m=C.a(a,d);c=b.a?b.a(c,m):b.call(null,c,m);if(Ac(c))return qb(c);d+=1}else return c}function b(a,b,c){var d=Ma(a),l=c;for(c=0;;)if(c<d){var m=C.a(a,c),l=b.a?b.a(l,m):b.call(null,l,m);if(Ac(l))return qb(l);c+=1}else return l}function c(a,b){var c=Ma(a);if(0===c)return b.l?b.l():b.call(null);for(var d=C.a(a,0),l=1;;)if(l<c){var m=C.a(a,l),d=b.a?b.a(d,m):b.call(null,d,m);if(Ac(d))return qb(d);l+=1}else return d}var d=null,d=function(d,
f,g,h){switch(arguments.length){case 2:return c.call(this,d,f);case 3:return b.call(this,d,f,g);case 4:return a.call(this,d,f,g,h)}throw Error("Invalid arity: "+arguments.length);};d.a=c;d.c=b;d.n=a;return d}(),Dc=function(){function a(a,b,c,d){for(var l=a.length;;)if(d<l){var m=a[d];c=b.a?b.a(c,m):b.call(null,c,m);if(Ac(c))return qb(c);d+=1}else return c}function b(a,b,c){var d=a.length,l=c;for(c=0;;)if(c<d){var m=a[c],l=b.a?b.a(l,m):b.call(null,l,m);if(Ac(l))return qb(l);c+=1}else return l}function c(a,
b){var c=a.length;if(0===a.length)return b.l?b.l():b.call(null);for(var d=a[0],l=1;;)if(l<c){var m=a[l],d=b.a?b.a(d,m):b.call(null,d,m);if(Ac(d))return qb(d);l+=1}else return d}var d=null,d=function(d,f,g,h){switch(arguments.length){case 2:return c.call(this,d,f);case 3:return b.call(this,d,f,g);case 4:return a.call(this,d,f,g,h)}throw Error("Invalid arity: "+arguments.length);};d.a=c;d.c=b;d.n=a;return d}();function Ec(a){return a?a.j&2||a.cc?!0:a.j?!1:w(La,a):w(La,a)}
function Fc(a){return a?a.j&16||a.Qb?!0:a.j?!1:w(Ta,a):w(Ta,a)}function Gc(a,b){this.e=a;this.m=b}Gc.prototype.ga=function(){return this.m<this.e.length};Gc.prototype.next=function(){var a=this.e[this.m];this.m+=1;return a};function F(a,b){this.e=a;this.m=b;this.j=166199550;this.q=8192}k=F.prototype;k.toString=function(){return ec(this)};k.Q=function(a,b){var c=b+this.m;return c<this.e.length?this.e[c]:null};k.$=function(a,b,c){a=b+this.m;return a<this.e.length?this.e[a]:c};k.vb=!0;
k.fb=function(){return new Gc(this.e,this.m)};k.T=function(){return this.m+1<this.e.length?new F(this.e,this.m+1):null};k.L=function(){return this.e.length-this.m};k.ab=function(){var a=Ma(this);return 0<a?new Hc(this,a-1,null):null};k.B=function(){return wc(this)};k.A=function(a,b){return Ic.a?Ic.a(this,b):Ic.call(null,this,b)};k.J=function(){return J};k.R=function(a,b){return Dc.n(this.e,b,this.e[this.m],this.m+1)};k.O=function(a,b,c){return Dc.n(this.e,b,c,this.m)};k.N=function(){return this.e[this.m]};
k.S=function(){return this.m+1<this.e.length?new F(this.e,this.m+1):J};k.D=function(){return this};k.G=function(a,b){return M.a?M.a(b,this):M.call(null,b,this)};F.prototype[Ea]=function(){return uc(this)};
var Jc=function(){function a(a,b){return b<a.length?new F(a,b):null}function b(a){return c.a(a,0)}var c=null,c=function(c,e){switch(arguments.length){case 1:return b.call(this,c);case 2:return a.call(this,c,e)}throw Error("Invalid arity: "+arguments.length);};c.b=b;c.a=a;return c}(),Kc=function(){function a(a,b){return Jc.a(a,b)}function b(a){return Jc.a(a,0)}var c=null,c=function(c,e){switch(arguments.length){case 1:return b.call(this,c);case 2:return a.call(this,c,e)}throw Error("Invalid arity: "+
arguments.length);};c.b=b;c.a=a;return c}();function Hc(a,b,c){this.qb=a;this.m=b;this.k=c;this.j=32374990;this.q=8192}k=Hc.prototype;k.toString=function(){return ec(this)};k.H=function(){return this.k};k.T=function(){return 0<this.m?new Hc(this.qb,this.m-1,null):null};k.L=function(){return this.m+1};k.B=function(){return wc(this)};k.A=function(a,b){return Ic.a?Ic.a(this,b):Ic.call(null,this,b)};k.J=function(){var a=this.k;return O.a?O.a(J,a):O.call(null,J,a)};
k.R=function(a,b){return P.a?P.a(b,this):P.call(null,b,this)};k.O=function(a,b,c){return P.c?P.c(b,c,this):P.call(null,b,c,this)};k.N=function(){return C.a(this.qb,this.m)};k.S=function(){return 0<this.m?new Hc(this.qb,this.m-1,null):J};k.D=function(){return this};k.F=function(a,b){return new Hc(this.qb,this.m,b)};k.G=function(a,b){return M.a?M.a(b,this):M.call(null,b,this)};Hc.prototype[Ea]=function(){return uc(this)};function Lc(a){return G(K(a))}yb._=function(a,b){return a===b};
var Nc=function(){function a(a,b){return null!=a?Ra(a,b):Ra(J,b)}var b=null,c=function(){function a(b,d,h){var l=null;if(2<arguments.length){for(var l=0,m=Array(arguments.length-2);l<m.length;)m[l]=arguments[l+2],++l;l=new F(m,0)}return c.call(this,b,d,l)}function c(a,d,e){for(;;)if(t(e))a=b.a(a,d),d=G(e),e=K(e);else return b.a(a,d)}a.i=2;a.f=function(a){var b=G(a);a=K(a);var d=G(a);a=H(a);return c(b,d,a)};a.d=c;return a}(),b=function(b,e,f){switch(arguments.length){case 0:return Mc;case 1:return b;
case 2:return a.call(this,b,e);default:var g=null;if(2<arguments.length){for(var g=0,h=Array(arguments.length-2);g<h.length;)h[g]=arguments[g+2],++g;g=new F(h,0)}return c.d(b,e,g)}throw Error("Invalid arity: "+arguments.length);};b.i=2;b.f=c.f;b.l=function(){return Mc};b.b=function(a){return a};b.a=a;b.d=c.d;return b}();function Oc(a){return null==a?null:Na(a)}
function Q(a){if(null!=a)if(a&&(a.j&2||a.cc))a=a.L(null);else if(a instanceof Array)a=a.length;else if("string"===typeof a)a=a.length;else if(w(La,a))a=Ma(a);else a:{a=D(a);for(var b=0;;){if(Ec(a)){a=b+Ma(a);break a}a=K(a);b+=1}a=void 0}else a=0;return a}
var Pc=function(){function a(a,b,c){for(;;){if(null==a)return c;if(0===b)return D(a)?G(a):c;if(Fc(a))return C.c(a,b,c);if(D(a))a=K(a),b-=1;else return c}}function b(a,b){for(;;){if(null==a)throw Error("Index out of bounds");if(0===b){if(D(a))return G(a);throw Error("Index out of bounds");}if(Fc(a))return C.a(a,b);if(D(a)){var c=K(a),g=b-1;a=c;b=g}else throw Error("Index out of bounds");}}var c=null,c=function(c,e,f){switch(arguments.length){case 2:return b.call(this,c,e);case 3:return a.call(this,
c,e,f)}throw Error("Invalid arity: "+arguments.length);};c.a=b;c.c=a;return c}(),R=function(){function a(a,b,c){if("number"!==typeof b)throw Error("index argument to nth must be a number.");if(null==a)return c;if(a&&(a.j&16||a.Qb))return a.$(null,b,c);if(a instanceof Array||"string"===typeof a)return b<a.length?a[b]:c;if(w(Ta,a))return C.a(a,b);if(a?a.j&64||a.jb||(a.j?0:w(Ua,a)):w(Ua,a))return Pc.c(a,b,c);throw Error([z("nth not supported on this type "),z(Da(Ba(a)))].join(""));}function b(a,b){if("number"!==
typeof b)throw Error("index argument to nth must be a number");if(null==a)return a;if(a&&(a.j&16||a.Qb))return a.Q(null,b);if(a instanceof Array||"string"===typeof a)return b<a.length?a[b]:null;if(w(Ta,a))return C.a(a,b);if(a?a.j&64||a.jb||(a.j?0:w(Ua,a)):w(Ua,a))return Pc.a(a,b);throw Error([z("nth not supported on this type "),z(Da(Ba(a)))].join(""));}var c=null,c=function(c,e,f){switch(arguments.length){case 2:return b.call(this,c,e);case 3:return a.call(this,c,e,f)}throw Error("Invalid arity: "+
arguments.length);};c.a=b;c.c=a;return c}(),S=function(){function a(a,b,c){return null!=a?a&&(a.j&256||a.Rb)?a.s(null,b,c):a instanceof Array?b<a.length?a[b]:c:"string"===typeof a?b<a.length?a[b]:c:w(Za,a)?$a.c(a,b,c):c:c}function b(a,b){return null==a?null:a&&(a.j&256||a.Rb)?a.t(null,b):a instanceof Array?b<a.length?a[b]:null:"string"===typeof a?b<a.length?a[b]:null:w(Za,a)?$a.a(a,b):null}var c=null,c=function(c,e,f){switch(arguments.length){case 2:return b.call(this,c,e);case 3:return a.call(this,
c,e,f)}throw Error("Invalid arity: "+arguments.length);};c.a=b;c.c=a;return c}(),Rc=function(){function a(a,b,c){if(null!=a)a=cb(a,b,c);else a:{a=[b];c=[c];b=a.length;for(var g=0,h=Ob(Qc);;)if(g<b)var l=g+1,h=h.kb(null,a[g],c[g]),g=l;else{a=Qb(h);break a}a=void 0}return a}var b=null,c=function(){function a(b,d,h,l){var m=null;if(3<arguments.length){for(var m=0,p=Array(arguments.length-3);m<p.length;)p[m]=arguments[m+3],++m;m=new F(p,0)}return c.call(this,b,d,h,m)}function c(a,d,e,l){for(;;)if(a=b.c(a,
d,e),t(l))d=G(l),e=Lc(l),l=K(K(l));else return a}a.i=3;a.f=function(a){var b=G(a);a=K(a);var d=G(a);a=K(a);var l=G(a);a=H(a);return c(b,d,l,a)};a.d=c;return a}(),b=function(b,e,f,g){switch(arguments.length){case 3:return a.call(this,b,e,f);default:var h=null;if(3<arguments.length){for(var h=0,l=Array(arguments.length-3);h<l.length;)l[h]=arguments[h+3],++h;h=new F(l,0)}return c.d(b,e,f,h)}throw Error("Invalid arity: "+arguments.length);};b.i=3;b.f=c.f;b.c=a;b.d=c.d;return b}(),Sc=function(){function a(a,
b){return null==a?null:eb(a,b)}var b=null,c=function(){function a(b,d,h){var l=null;if(2<arguments.length){for(var l=0,m=Array(arguments.length-2);l<m.length;)m[l]=arguments[l+2],++l;l=new F(m,0)}return c.call(this,b,d,l)}function c(a,d,e){for(;;){if(null==a)return null;a=b.a(a,d);if(t(e))d=G(e),e=K(e);else return a}}a.i=2;a.f=function(a){var b=G(a);a=K(a);var d=G(a);a=H(a);return c(b,d,a)};a.d=c;return a}(),b=function(b,e,f){switch(arguments.length){case 1:return b;case 2:return a.call(this,b,e);
default:var g=null;if(2<arguments.length){for(var g=0,h=Array(arguments.length-2);g<h.length;)h[g]=arguments[g+2],++g;g=new F(h,0)}return c.d(b,e,g)}throw Error("Invalid arity: "+arguments.length);};b.i=2;b.f=c.f;b.b=function(a){return a};b.a=a;b.d=c.d;return b}();function Tc(a){var b="function"==n(a);return t(b)?b:a?t(t(null)?null:a.bc)?!0:a.yb?!1:w(Ja,a):w(Ja,a)}function Uc(a,b){this.h=a;this.k=b;this.q=0;this.j=393217}k=Uc.prototype;
k.call=function(){function a(a,b,c,d,e,f,g,h,l,m,p,q,u,s,v,y,B,E,N,Y,ra,I){a=this.h;return T.ub?T.ub(a,b,c,d,e,f,g,h,l,m,p,q,u,s,v,y,B,E,N,Y,ra,I):T.call(null,a,b,c,d,e,f,g,h,l,m,p,q,u,s,v,y,B,E,N,Y,ra,I)}function b(a,b,c,d,e,f,g,h,l,m,p,q,u,s,v,y,B,E,N,Y,ra){a=this;return a.h.Fa?a.h.Fa(b,c,d,e,f,g,h,l,m,p,q,u,s,v,y,B,E,N,Y,ra):a.h.call(null,b,c,d,e,f,g,h,l,m,p,q,u,s,v,y,B,E,N,Y,ra)}function c(a,b,c,d,e,f,g,h,l,m,p,q,u,s,v,y,B,E,N,Y){a=this;return a.h.Ea?a.h.Ea(b,c,d,e,f,g,h,l,m,p,q,u,s,v,y,B,E,N,
Y):a.h.call(null,b,c,d,e,f,g,h,l,m,p,q,u,s,v,y,B,E,N,Y)}function d(a,b,c,d,e,f,g,h,l,m,p,q,u,s,v,y,B,E,N){a=this;return a.h.Da?a.h.Da(b,c,d,e,f,g,h,l,m,p,q,u,s,v,y,B,E,N):a.h.call(null,b,c,d,e,f,g,h,l,m,p,q,u,s,v,y,B,E,N)}function e(a,b,c,d,e,f,g,h,l,m,p,q,u,s,v,y,B,E){a=this;return a.h.Ca?a.h.Ca(b,c,d,e,f,g,h,l,m,p,q,u,s,v,y,B,E):a.h.call(null,b,c,d,e,f,g,h,l,m,p,q,u,s,v,y,B,E)}function f(a,b,c,d,e,f,g,h,l,m,p,q,u,s,v,y,B){a=this;return a.h.Ba?a.h.Ba(b,c,d,e,f,g,h,l,m,p,q,u,s,v,y,B):a.h.call(null,
b,c,d,e,f,g,h,l,m,p,q,u,s,v,y,B)}function g(a,b,c,d,e,f,g,h,l,m,p,q,u,s,v,y){a=this;return a.h.Aa?a.h.Aa(b,c,d,e,f,g,h,l,m,p,q,u,s,v,y):a.h.call(null,b,c,d,e,f,g,h,l,m,p,q,u,s,v,y)}function h(a,b,c,d,e,f,g,h,l,m,p,q,u,s,v){a=this;return a.h.za?a.h.za(b,c,d,e,f,g,h,l,m,p,q,u,s,v):a.h.call(null,b,c,d,e,f,g,h,l,m,p,q,u,s,v)}function l(a,b,c,d,e,f,g,h,l,m,p,q,u,s){a=this;return a.h.ya?a.h.ya(b,c,d,e,f,g,h,l,m,p,q,u,s):a.h.call(null,b,c,d,e,f,g,h,l,m,p,q,u,s)}function m(a,b,c,d,e,f,g,h,l,m,p,q,u){a=this;
return a.h.xa?a.h.xa(b,c,d,e,f,g,h,l,m,p,q,u):a.h.call(null,b,c,d,e,f,g,h,l,m,p,q,u)}function p(a,b,c,d,e,f,g,h,l,m,p,q){a=this;return a.h.wa?a.h.wa(b,c,d,e,f,g,h,l,m,p,q):a.h.call(null,b,c,d,e,f,g,h,l,m,p,q)}function q(a,b,c,d,e,f,g,h,l,m,p){a=this;return a.h.va?a.h.va(b,c,d,e,f,g,h,l,m,p):a.h.call(null,b,c,d,e,f,g,h,l,m,p)}function s(a,b,c,d,e,f,g,h,l,m){a=this;return a.h.Ha?a.h.Ha(b,c,d,e,f,g,h,l,m):a.h.call(null,b,c,d,e,f,g,h,l,m)}function u(a,b,c,d,e,f,g,h,l){a=this;return a.h.Ga?a.h.Ga(b,c,
d,e,f,g,h,l):a.h.call(null,b,c,d,e,f,g,h,l)}function v(a,b,c,d,e,f,g,h){a=this;return a.h.ia?a.h.ia(b,c,d,e,f,g,h):a.h.call(null,b,c,d,e,f,g,h)}function y(a,b,c,d,e,f,g){a=this;return a.h.P?a.h.P(b,c,d,e,f,g):a.h.call(null,b,c,d,e,f,g)}function B(a,b,c,d,e,f){a=this;return a.h.r?a.h.r(b,c,d,e,f):a.h.call(null,b,c,d,e,f)}function E(a,b,c,d,e){a=this;return a.h.n?a.h.n(b,c,d,e):a.h.call(null,b,c,d,e)}function N(a,b,c,d){a=this;return a.h.c?a.h.c(b,c,d):a.h.call(null,b,c,d)}function Y(a,b,c){a=this;
return a.h.a?a.h.a(b,c):a.h.call(null,b,c)}function ra(a,b){a=this;return a.h.b?a.h.b(b):a.h.call(null,b)}function Pa(a){a=this;return a.h.l?a.h.l():a.h.call(null)}var I=null,I=function(I,qa,ta,va,xa,Ca,Ga,Ka,Oa,Sa,Ya,gb,ob,Ab,Wb,jc,zc,Zc,Gd,De,Wf,dh){switch(arguments.length){case 1:return Pa.call(this,I);case 2:return ra.call(this,I,qa);case 3:return Y.call(this,I,qa,ta);case 4:return N.call(this,I,qa,ta,va);case 5:return E.call(this,I,qa,ta,va,xa);case 6:return B.call(this,I,qa,ta,va,xa,Ca);case 7:return y.call(this,
I,qa,ta,va,xa,Ca,Ga);case 8:return v.call(this,I,qa,ta,va,xa,Ca,Ga,Ka);case 9:return u.call(this,I,qa,ta,va,xa,Ca,Ga,Ka,Oa);case 10:return s.call(this,I,qa,ta,va,xa,Ca,Ga,Ka,Oa,Sa);case 11:return q.call(this,I,qa,ta,va,xa,Ca,Ga,Ka,Oa,Sa,Ya);case 12:return p.call(this,I,qa,ta,va,xa,Ca,Ga,Ka,Oa,Sa,Ya,gb);case 13:return m.call(this,I,qa,ta,va,xa,Ca,Ga,Ka,Oa,Sa,Ya,gb,ob);case 14:return l.call(this,I,qa,ta,va,xa,Ca,Ga,Ka,Oa,Sa,Ya,gb,ob,Ab);case 15:return h.call(this,I,qa,ta,va,xa,Ca,Ga,Ka,Oa,Sa,Ya,gb,
ob,Ab,Wb);case 16:return g.call(this,I,qa,ta,va,xa,Ca,Ga,Ka,Oa,Sa,Ya,gb,ob,Ab,Wb,jc);case 17:return f.call(this,I,qa,ta,va,xa,Ca,Ga,Ka,Oa,Sa,Ya,gb,ob,Ab,Wb,jc,zc);case 18:return e.call(this,I,qa,ta,va,xa,Ca,Ga,Ka,Oa,Sa,Ya,gb,ob,Ab,Wb,jc,zc,Zc);case 19:return d.call(this,I,qa,ta,va,xa,Ca,Ga,Ka,Oa,Sa,Ya,gb,ob,Ab,Wb,jc,zc,Zc,Gd);case 20:return c.call(this,I,qa,ta,va,xa,Ca,Ga,Ka,Oa,Sa,Ya,gb,ob,Ab,Wb,jc,zc,Zc,Gd,De);case 21:return b.call(this,I,qa,ta,va,xa,Ca,Ga,Ka,Oa,Sa,Ya,gb,ob,Ab,Wb,jc,zc,Zc,Gd,De,
Wf);case 22:return a.call(this,I,qa,ta,va,xa,Ca,Ga,Ka,Oa,Sa,Ya,gb,ob,Ab,Wb,jc,zc,Zc,Gd,De,Wf,dh)}throw Error("Invalid arity: "+arguments.length);};I.b=Pa;I.a=ra;I.c=Y;I.n=N;I.r=E;I.P=B;I.ia=y;I.Ga=v;I.Ha=u;I.va=s;I.wa=q;I.xa=p;I.ya=m;I.za=l;I.Aa=h;I.Ba=g;I.Ca=f;I.Da=e;I.Ea=d;I.Fa=c;I.hc=b;I.ub=a;return I}();k.apply=function(a,b){return this.call.apply(this,[this].concat(Fa(b)))};k.l=function(){return this.h.l?this.h.l():this.h.call(null)};
k.b=function(a){return this.h.b?this.h.b(a):this.h.call(null,a)};k.a=function(a,b){return this.h.a?this.h.a(a,b):this.h.call(null,a,b)};k.c=function(a,b,c){return this.h.c?this.h.c(a,b,c):this.h.call(null,a,b,c)};k.n=function(a,b,c,d){return this.h.n?this.h.n(a,b,c,d):this.h.call(null,a,b,c,d)};k.r=function(a,b,c,d,e){return this.h.r?this.h.r(a,b,c,d,e):this.h.call(null,a,b,c,d,e)};k.P=function(a,b,c,d,e,f){return this.h.P?this.h.P(a,b,c,d,e,f):this.h.call(null,a,b,c,d,e,f)};
k.ia=function(a,b,c,d,e,f,g){return this.h.ia?this.h.ia(a,b,c,d,e,f,g):this.h.call(null,a,b,c,d,e,f,g)};k.Ga=function(a,b,c,d,e,f,g,h){return this.h.Ga?this.h.Ga(a,b,c,d,e,f,g,h):this.h.call(null,a,b,c,d,e,f,g,h)};k.Ha=function(a,b,c,d,e,f,g,h,l){return this.h.Ha?this.h.Ha(a,b,c,d,e,f,g,h,l):this.h.call(null,a,b,c,d,e,f,g,h,l)};k.va=function(a,b,c,d,e,f,g,h,l,m){return this.h.va?this.h.va(a,b,c,d,e,f,g,h,l,m):this.h.call(null,a,b,c,d,e,f,g,h,l,m)};
k.wa=function(a,b,c,d,e,f,g,h,l,m,p){return this.h.wa?this.h.wa(a,b,c,d,e,f,g,h,l,m,p):this.h.call(null,a,b,c,d,e,f,g,h,l,m,p)};k.xa=function(a,b,c,d,e,f,g,h,l,m,p,q){return this.h.xa?this.h.xa(a,b,c,d,e,f,g,h,l,m,p,q):this.h.call(null,a,b,c,d,e,f,g,h,l,m,p,q)};k.ya=function(a,b,c,d,e,f,g,h,l,m,p,q,s){return this.h.ya?this.h.ya(a,b,c,d,e,f,g,h,l,m,p,q,s):this.h.call(null,a,b,c,d,e,f,g,h,l,m,p,q,s)};
k.za=function(a,b,c,d,e,f,g,h,l,m,p,q,s,u){return this.h.za?this.h.za(a,b,c,d,e,f,g,h,l,m,p,q,s,u):this.h.call(null,a,b,c,d,e,f,g,h,l,m,p,q,s,u)};k.Aa=function(a,b,c,d,e,f,g,h,l,m,p,q,s,u,v){return this.h.Aa?this.h.Aa(a,b,c,d,e,f,g,h,l,m,p,q,s,u,v):this.h.call(null,a,b,c,d,e,f,g,h,l,m,p,q,s,u,v)};k.Ba=function(a,b,c,d,e,f,g,h,l,m,p,q,s,u,v,y){return this.h.Ba?this.h.Ba(a,b,c,d,e,f,g,h,l,m,p,q,s,u,v,y):this.h.call(null,a,b,c,d,e,f,g,h,l,m,p,q,s,u,v,y)};
k.Ca=function(a,b,c,d,e,f,g,h,l,m,p,q,s,u,v,y,B){return this.h.Ca?this.h.Ca(a,b,c,d,e,f,g,h,l,m,p,q,s,u,v,y,B):this.h.call(null,a,b,c,d,e,f,g,h,l,m,p,q,s,u,v,y,B)};k.Da=function(a,b,c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E){return this.h.Da?this.h.Da(a,b,c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E):this.h.call(null,a,b,c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E)};
k.Ea=function(a,b,c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E,N){return this.h.Ea?this.h.Ea(a,b,c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E,N):this.h.call(null,a,b,c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E,N)};k.Fa=function(a,b,c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E,N,Y){return this.h.Fa?this.h.Fa(a,b,c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E,N,Y):this.h.call(null,a,b,c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E,N,Y)};
k.hc=function(a,b,c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E,N,Y,ra){var Pa=this.h;return T.ub?T.ub(Pa,a,b,c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E,N,Y,ra):T.call(null,Pa,a,b,c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E,N,Y,ra)};k.bc=!0;k.F=function(a,b){return new Uc(this.h,b)};k.H=function(){return this.k};function O(a,b){return Tc(a)&&!(a?a.j&262144||a.Bc||(a.j?0:w(tb,a)):w(tb,a))?new Uc(a,b):null==a?null:ub(a,b)}function Vc(a){var b=null!=a;return(b?a?a.j&131072||a.kc||(a.j?0:w(rb,a)):w(rb,a):b)?sb(a):null}
function Wc(a){return null==a?null:lb(a)}
var Xc=function(){function a(a,b){return null==a?null:kb(a,b)}var b=null,c=function(){function a(b,d,h){var l=null;if(2<arguments.length){for(var l=0,m=Array(arguments.length-2);l<m.length;)m[l]=arguments[l+2],++l;l=new F(m,0)}return c.call(this,b,d,l)}function c(a,d,e){for(;;){if(null==a)return null;a=b.a(a,d);if(t(e))d=G(e),e=K(e);else return a}}a.i=2;a.f=function(a){var b=G(a);a=K(a);var d=G(a);a=H(a);return c(b,d,a)};a.d=c;return a}(),b=function(b,e,f){switch(arguments.length){case 1:return b;case 2:return a.call(this,
b,e);default:var g=null;if(2<arguments.length){for(var g=0,h=Array(arguments.length-2);g<h.length;)h[g]=arguments[g+2],++g;g=new F(h,0)}return c.d(b,e,g)}throw Error("Invalid arity: "+arguments.length);};b.i=2;b.f=c.f;b.b=function(a){return a};b.a=a;b.d=c.d;return b}();function Yc(a){return null==a||Aa(D(a))}function $c(a){return null==a?!1:a?a.j&8||a.tc?!0:a.j?!1:w(Qa,a):w(Qa,a)}function ad(a){return null==a?!1:a?a.j&4096||a.zc?!0:a.j?!1:w(jb,a):w(jb,a)}
function bd(a){return a?a.j&512||a.rc?!0:a.j?!1:w(ab,a):w(ab,a)}function cd(a){return a?a.j&16777216||a.yc?!0:a.j?!1:w(Db,a):w(Db,a)}function dd(a){return null==a?!1:a?a.j&1024||a.ic?!0:a.j?!1:w(db,a):w(db,a)}function ed(a){return a?a.j&16384||a.Ac?!0:a.j?!1:w(nb,a):w(nb,a)}function fd(a){return a?a.q&512||a.sc?!0:!1:!1}function gd(a){var b=[];ea(a,function(a,b){return function(a,c){return b.push(c)}}(a,b));return b}function hd(a,b,c,d,e){for(;0!==e;)c[d]=a[b],d+=1,e-=1,b+=1}
function id(a,b,c,d,e){b+=e-1;for(d+=e-1;0!==e;)c[d]=a[b],d-=1,e-=1,b-=1}var jd={};function kd(a){return null==a?!1:a?a.j&64||a.jb?!0:a.j?!1:w(Ua,a):w(Ua,a)}function ld(a){return a?a.j&8388608||a.mc?!0:a.j?!1:w(Bb,a):w(Bb,a)}function md(a){return t(a)?!0:!1}function nd(a,b){return S.c(a,b,jd)===jd?!1:!0}
function od(a,b){if(a===b)return 0;if(null==a)return-1;if(null==b)return 1;if(Ba(a)===Ba(b))return a&&(a.q&2048||a.sb)?a.tb(null,b):ha(a,b);throw Error("compare on non-nil objects of different types");}
var pd=function(){function a(a,b,c,g){for(;;){var h=od(R.a(a,g),R.a(b,g));if(0===h&&g+1<c)g+=1;else return h}}function b(a,b){var f=Q(a),g=Q(b);return f<g?-1:f>g?1:c.n(a,b,f,0)}var c=null,c=function(c,e,f,g){switch(arguments.length){case 2:return b.call(this,c,e);case 4:return a.call(this,c,e,f,g)}throw Error("Invalid arity: "+arguments.length);};c.a=b;c.n=a;return c}();
function qd(a){return sc.a(a,od)?od:function(b,c){var d=a.a?a.a(b,c):a.call(null,b,c);return"number"===typeof d?d:t(d)?-1:t(a.a?a.a(c,b):a.call(null,c,b))?1:0}}
var sd=function(){function a(a,b){if(D(b)){var c=rd.b?rd.b(b):rd.call(null,b),g=qd(a);ia(c,g);return D(c)}return J}function b(a){return c.a(od,a)}var c=null,c=function(c,e){switch(arguments.length){case 1:return b.call(this,c);case 2:return a.call(this,c,e)}throw Error("Invalid arity: "+arguments.length);};c.b=b;c.a=a;return c}(),td=function(){function a(a,b,c){return sd.a(function(c,f){return qd(b).call(null,a.b?a.b(c):a.call(null,c),a.b?a.b(f):a.call(null,f))},c)}function b(a,b){return c.c(a,od,
b)}var c=null,c=function(c,e,f){switch(arguments.length){case 2:return b.call(this,c,e);case 3:return a.call(this,c,e,f)}throw Error("Invalid arity: "+arguments.length);};c.a=b;c.c=a;return c}(),P=function(){function a(a,b,c){for(c=D(c);;)if(c){var g=G(c);b=a.a?a.a(b,g):a.call(null,b,g);if(Ac(b))return qb(b);c=K(c)}else return b}function b(a,b){var c=D(b);if(c){var g=G(c),c=K(c);return A.c?A.c(a,g,c):A.call(null,a,g,c)}return a.l?a.l():a.call(null)}var c=null,c=function(c,e,f){switch(arguments.length){case 2:return b.call(this,
c,e);case 3:return a.call(this,c,e,f)}throw Error("Invalid arity: "+arguments.length);};c.a=b;c.c=a;return c}(),A=function(){function a(a,b,c){return c&&(c.j&524288||c.Sb)?c.O(null,a,b):c instanceof Array?Dc.c(c,a,b):"string"===typeof c?Dc.c(c,a,b):w(vb,c)?wb.c(c,a,b):P.c(a,b,c)}function b(a,b){return b&&(b.j&524288||b.Sb)?b.R(null,a):b instanceof Array?Dc.a(b,a):"string"===typeof b?Dc.a(b,a):w(vb,b)?wb.a(b,a):P.a(a,b)}var c=null,c=function(c,e,f){switch(arguments.length){case 2:return b.call(this,
c,e);case 3:return a.call(this,c,e,f)}throw Error("Invalid arity: "+arguments.length);};c.a=b;c.c=a;return c}();function ud(a){return a}
var vd=function(){function a(a,b){return function(){function c(b,e){return a.a?a.a(b,e):a.call(null,b,e)}function g(a){return b.b?b.b(a):b.call(null,a)}function h(){return a.l?a.l():a.call(null)}var l=null,l=function(a,b){switch(arguments.length){case 0:return h.call(this);case 1:return g.call(this,a);case 2:return c.call(this,a,b)}throw Error("Invalid arity: "+arguments.length);};l.l=h;l.b=g;l.a=c;return l}()}function b(a){return c.a(a,ud)}var c=null,c=function(c,e){switch(arguments.length){case 1:return b.call(this,
c);case 2:return a.call(this,c,e)}throw Error("Invalid arity: "+arguments.length);};c.b=b;c.a=a;return c}(),wd=function(){function a(a,b,c,g){a=a.b?a.b(b):a.call(null,b);c=A.c(a,c,g);return a.b?a.b(c):a.call(null,c)}function b(a,b,f){return c.n(a,b,b.l?b.l():b.call(null),f)}var c=null,c=function(c,e,f,g){switch(arguments.length){case 3:return b.call(this,c,e,f);case 4:return a.call(this,c,e,f,g)}throw Error("Invalid arity: "+arguments.length);};c.c=b;c.n=a;return c}(),xd=function(){var a=null,b=function(){function b(a,
c,g){var h=null;if(2<arguments.length){for(var h=0,l=Array(arguments.length-2);h<l.length;)l[h]=arguments[h+2],++h;h=new F(l,0)}return d.call(this,a,c,h)}function d(b,c,d){return A.c(a,b+c,d)}b.i=2;b.f=function(a){var b=G(a);a=K(a);var c=G(a);a=H(a);return d(b,c,a)};b.d=d;return b}(),a=function(a,d,e){switch(arguments.length){case 0:return 0;case 1:return a;case 2:return a+d;default:var f=null;if(2<arguments.length){for(var f=0,g=Array(arguments.length-2);f<g.length;)g[f]=arguments[f+2],++f;f=new F(g,
0)}return b.d(a,d,f)}throw Error("Invalid arity: "+arguments.length);};a.i=2;a.f=b.f;a.l=function(){return 0};a.b=function(a){return a};a.a=function(a,b){return a+b};a.d=b.d;return a}(),yd=function(){var a=null,b=function(){function a(c,f,g){var h=null;if(2<arguments.length){for(var h=0,l=Array(arguments.length-2);h<l.length;)l[h]=arguments[h+2],++h;h=new F(l,0)}return b.call(this,c,f,h)}function b(a,c,d){for(;;)if(a<c)if(K(d))a=c,c=G(d),d=K(d);else return c<G(d);else return!1}a.i=2;a.f=function(a){var c=
G(a);a=K(a);var g=G(a);a=H(a);return b(c,g,a)};a.d=b;return a}(),a=function(a,d,e){switch(arguments.length){case 1:return!0;case 2:return a<d;default:var f=null;if(2<arguments.length){for(var f=0,g=Array(arguments.length-2);f<g.length;)g[f]=arguments[f+2],++f;f=new F(g,0)}return b.d(a,d,f)}throw Error("Invalid arity: "+arguments.length);};a.i=2;a.f=b.f;a.b=function(){return!0};a.a=function(a,b){return a<b};a.d=b.d;return a}(),zd=function(){var a=null,b=function(){function a(c,f,g){var h=null;if(2<
arguments.length){for(var h=0,l=Array(arguments.length-2);h<l.length;)l[h]=arguments[h+2],++h;h=new F(l,0)}return b.call(this,c,f,h)}function b(a,c,d){for(;;)if(a<=c)if(K(d))a=c,c=G(d),d=K(d);else return c<=G(d);else return!1}a.i=2;a.f=function(a){var c=G(a);a=K(a);var g=G(a);a=H(a);return b(c,g,a)};a.d=b;return a}(),a=function(a,d,e){switch(arguments.length){case 1:return!0;case 2:return a<=d;default:var f=null;if(2<arguments.length){for(var f=0,g=Array(arguments.length-2);f<g.length;)g[f]=arguments[f+
2],++f;f=new F(g,0)}return b.d(a,d,f)}throw Error("Invalid arity: "+arguments.length);};a.i=2;a.f=b.f;a.b=function(){return!0};a.a=function(a,b){return a<=b};a.d=b.d;return a}(),Ad=function(){var a=null,b=function(){function a(c,f,g){var h=null;if(2<arguments.length){for(var h=0,l=Array(arguments.length-2);h<l.length;)l[h]=arguments[h+2],++h;h=new F(l,0)}return b.call(this,c,f,h)}function b(a,c,d){for(;;)if(a>c)if(K(d))a=c,c=G(d),d=K(d);else return c>G(d);else return!1}a.i=2;a.f=function(a){var c=
G(a);a=K(a);var g=G(a);a=H(a);return b(c,g,a)};a.d=b;return a}(),a=function(a,d,e){switch(arguments.length){case 1:return!0;case 2:return a>d;default:var f=null;if(2<arguments.length){for(var f=0,g=Array(arguments.length-2);f<g.length;)g[f]=arguments[f+2],++f;f=new F(g,0)}return b.d(a,d,f)}throw Error("Invalid arity: "+arguments.length);};a.i=2;a.f=b.f;a.b=function(){return!0};a.a=function(a,b){return a>b};a.d=b.d;return a}(),Bd=function(){var a=null,b=function(){function a(c,f,g){var h=null;if(2<
arguments.length){for(var h=0,l=Array(arguments.length-2);h<l.length;)l[h]=arguments[h+2],++h;h=new F(l,0)}return b.call(this,c,f,h)}function b(a,c,d){for(;;)if(a>=c)if(K(d))a=c,c=G(d),d=K(d);else return c>=G(d);else return!1}a.i=2;a.f=function(a){var c=G(a);a=K(a);var g=G(a);a=H(a);return b(c,g,a)};a.d=b;return a}(),a=function(a,d,e){switch(arguments.length){case 1:return!0;case 2:return a>=d;default:var f=null;if(2<arguments.length){for(var f=0,g=Array(arguments.length-2);f<g.length;)g[f]=arguments[f+
2],++f;f=new F(g,0)}return b.d(a,d,f)}throw Error("Invalid arity: "+arguments.length);};a.i=2;a.f=b.f;a.b=function(){return!0};a.a=function(a,b){return a>=b};a.d=b.d;return a}();function Cd(a,b){var c=(a-a%b)/b;return 0<=c?Math.floor.b?Math.floor.b(c):Math.floor.call(null,c):Math.ceil.b?Math.ceil.b(c):Math.ceil.call(null,c)}function Dd(a){a-=a>>1&1431655765;a=(a&858993459)+(a>>2&858993459);return 16843009*(a+(a>>4)&252645135)>>24}
function Ed(a){var b=1;for(a=D(a);;)if(a&&0<b)b-=1,a=K(a);else return a}
var z=function(){function a(a){return null==a?"":da(a)}var b=null,c=function(){function a(b,d){var h=null;if(1<arguments.length){for(var h=0,l=Array(arguments.length-1);h<l.length;)l[h]=arguments[h+1],++h;h=new F(l,0)}return c.call(this,b,h)}function c(a,d){for(var e=new fa(b.b(a)),l=d;;)if(t(l))e=e.append(b.b(G(l))),l=K(l);else return e.toString()}a.i=1;a.f=function(a){var b=G(a);a=H(a);return c(b,a)};a.d=c;return a}(),b=function(b,e){switch(arguments.length){case 0:return"";case 1:return a.call(this,
b);default:var f=null;if(1<arguments.length){for(var f=0,g=Array(arguments.length-1);f<g.length;)g[f]=arguments[f+1],++f;f=new F(g,0)}return c.d(b,f)}throw Error("Invalid arity: "+arguments.length);};b.i=1;b.f=c.f;b.l=function(){return""};b.b=a;b.d=c.d;return b}();function Ic(a,b){var c;if(cd(b))if(Ec(a)&&Ec(b)&&Q(a)!==Q(b))c=!1;else a:{c=D(a);for(var d=D(b);;){if(null==c){c=null==d;break a}if(null!=d&&sc.a(G(c),G(d)))c=K(c),d=K(d);else{c=!1;break a}}c=void 0}else c=null;return md(c)}
function Fd(a,b,c,d,e){this.k=a;this.first=b;this.M=c;this.count=d;this.p=e;this.j=65937646;this.q=8192}k=Fd.prototype;k.toString=function(){return ec(this)};k.H=function(){return this.k};k.T=function(){return 1===this.count?null:this.M};k.L=function(){return this.count};k.La=function(){return this.first};k.Ma=function(){return Wa(this)};k.B=function(){var a=this.p;return null!=a?a:this.p=a=wc(this)};k.A=function(a,b){return Ic(this,b)};k.J=function(){return ub(J,this.k)};
k.R=function(a,b){return P.a(b,this)};k.O=function(a,b,c){return P.c(b,c,this)};k.N=function(){return this.first};k.S=function(){return 1===this.count?J:this.M};k.D=function(){return this};k.F=function(a,b){return new Fd(b,this.first,this.M,this.count,this.p)};k.G=function(a,b){return new Fd(this.k,b,this,this.count+1,null)};Fd.prototype[Ea]=function(){return uc(this)};function Hd(a){this.k=a;this.j=65937614;this.q=8192}k=Hd.prototype;k.toString=function(){return ec(this)};k.H=function(){return this.k};
k.T=function(){return null};k.L=function(){return 0};k.La=function(){return null};k.Ma=function(){throw Error("Can't pop empty list");};k.B=function(){return 0};k.A=function(a,b){return Ic(this,b)};k.J=function(){return this};k.R=function(a,b){return P.a(b,this)};k.O=function(a,b,c){return P.c(b,c,this)};k.N=function(){return null};k.S=function(){return J};k.D=function(){return null};k.F=function(a,b){return new Hd(b)};k.G=function(a,b){return new Fd(this.k,b,null,1,null)};var J=new Hd(null);
Hd.prototype[Ea]=function(){return uc(this)};function Id(a){return a?a.j&134217728||a.xc?!0:a.j?!1:w(Fb,a):w(Fb,a)}function Jd(a){return Id(a)?Gb(a):A.c(Nc,J,a)}
var Kd=function(){function a(a){var d=null;if(0<arguments.length){for(var d=0,e=Array(arguments.length-0);d<e.length;)e[d]=arguments[d+0],++d;d=new F(e,0)}return b.call(this,d)}function b(a){var b;if(a instanceof F&&0===a.m)b=a.e;else a:{for(b=[];;)if(null!=a)b.push(a.N(null)),a=a.T(null);else break a;b=void 0}a=b.length;for(var e=J;;)if(0<a){var f=a-1,e=e.G(null,b[a-1]);a=f}else return e}a.i=0;a.f=function(a){a=D(a);return b(a)};a.d=b;return a}();
function Ld(a,b,c,d){this.k=a;this.first=b;this.M=c;this.p=d;this.j=65929452;this.q=8192}k=Ld.prototype;k.toString=function(){return ec(this)};k.H=function(){return this.k};k.T=function(){return null==this.M?null:D(this.M)};k.B=function(){var a=this.p;return null!=a?a:this.p=a=wc(this)};k.A=function(a,b){return Ic(this,b)};k.J=function(){return O(J,this.k)};k.R=function(a,b){return P.a(b,this)};k.O=function(a,b,c){return P.c(b,c,this)};k.N=function(){return this.first};
k.S=function(){return null==this.M?J:this.M};k.D=function(){return this};k.F=function(a,b){return new Ld(b,this.first,this.M,this.p)};k.G=function(a,b){return new Ld(null,b,this,this.p)};Ld.prototype[Ea]=function(){return uc(this)};function M(a,b){var c=null==b;return(c?c:b&&(b.j&64||b.jb))?new Ld(null,a,b,null):new Ld(null,a,D(b),null)}
function Md(a,b){if(a.pa===b.pa)return 0;var c=Aa(a.ba);if(t(c?b.ba:c))return-1;if(t(a.ba)){if(Aa(b.ba))return 1;c=ha(a.ba,b.ba);return 0===c?ha(a.name,b.name):c}return ha(a.name,b.name)}function U(a,b,c,d){this.ba=a;this.name=b;this.pa=c;this.Ya=d;this.j=2153775105;this.q=4096}k=U.prototype;k.v=function(a,b){return Lb(b,[z(":"),z(this.pa)].join(""))};k.B=function(){var a=this.Ya;return null!=a?a:this.Ya=a=oc(this)+2654435769|0};
k.call=function(){var a=null,a=function(a,c,d){switch(arguments.length){case 2:return S.a(c,this);case 3:return S.c(c,this,d)}throw Error("Invalid arity: "+arguments.length);};a.a=function(a,c){return S.a(c,this)};a.c=function(a,c,d){return S.c(c,this,d)};return a}();k.apply=function(a,b){return this.call.apply(this,[this].concat(Fa(b)))};k.b=function(a){return S.a(a,this)};k.a=function(a,b){return S.c(a,this,b)};k.A=function(a,b){return b instanceof U?this.pa===b.pa:!1};
k.toString=function(){return[z(":"),z(this.pa)].join("")};function Nd(a,b){return a===b?!0:a instanceof U&&b instanceof U?a.pa===b.pa:!1}
var Pd=function(){function a(a,b){return new U(a,b,[z(t(a)?[z(a),z("/")].join(""):null),z(b)].join(""),null)}function b(a){if(a instanceof U)return a;if(a instanceof qc){var b;if(a&&(a.q&4096||a.lc))b=a.ba;else throw Error([z("Doesn't support namespace: "),z(a)].join(""));return new U(b,Od.b?Od.b(a):Od.call(null,a),a.ta,null)}return"string"===typeof a?(b=a.split("/"),2===b.length?new U(b[0],b[1],a,null):new U(null,b[0],a,null)):null}var c=null,c=function(c,e){switch(arguments.length){case 1:return b.call(this,
c);case 2:return a.call(this,c,e)}throw Error("Invalid arity: "+arguments.length);};c.b=b;c.a=a;return c}();function V(a,b,c,d){this.k=a;this.cb=b;this.C=c;this.p=d;this.q=0;this.j=32374988}k=V.prototype;k.toString=function(){return ec(this)};function Qd(a){null!=a.cb&&(a.C=a.cb.l?a.cb.l():a.cb.call(null),a.cb=null);return a.C}k.H=function(){return this.k};k.T=function(){Cb(this);return null==this.C?null:K(this.C)};k.B=function(){var a=this.p;return null!=a?a:this.p=a=wc(this)};
k.A=function(a,b){return Ic(this,b)};k.J=function(){return O(J,this.k)};k.R=function(a,b){return P.a(b,this)};k.O=function(a,b,c){return P.c(b,c,this)};k.N=function(){Cb(this);return null==this.C?null:G(this.C)};k.S=function(){Cb(this);return null!=this.C?H(this.C):J};k.D=function(){Qd(this);if(null==this.C)return null;for(var a=this.C;;)if(a instanceof V)a=Qd(a);else return this.C=a,D(this.C)};k.F=function(a,b){return new V(b,this.cb,this.C,this.p)};k.G=function(a,b){return M(b,this)};
V.prototype[Ea]=function(){return uc(this)};function Rd(a,b){this.Ab=a;this.end=b;this.q=0;this.j=2}Rd.prototype.L=function(){return this.end};Rd.prototype.add=function(a){this.Ab[this.end]=a;return this.end+=1};Rd.prototype.ca=function(){var a=new Sd(this.Ab,0,this.end);this.Ab=null;return a};function Td(a){return new Rd(Array(a),0)}function Sd(a,b,c){this.e=a;this.V=b;this.end=c;this.q=0;this.j=524306}k=Sd.prototype;k.R=function(a,b){return Dc.n(this.e,b,this.e[this.V],this.V+1)};
k.O=function(a,b,c){return Dc.n(this.e,b,c,this.V)};k.Pb=function(){if(this.V===this.end)throw Error("-drop-first of empty chunk");return new Sd(this.e,this.V+1,this.end)};k.Q=function(a,b){return this.e[this.V+b]};k.$=function(a,b,c){return 0<=b&&b<this.end-this.V?this.e[this.V+b]:c};k.L=function(){return this.end-this.V};
var Ud=function(){function a(a,b,c){return new Sd(a,b,c)}function b(a,b){return new Sd(a,b,a.length)}function c(a){return new Sd(a,0,a.length)}var d=null,d=function(d,f,g){switch(arguments.length){case 1:return c.call(this,d);case 2:return b.call(this,d,f);case 3:return a.call(this,d,f,g)}throw Error("Invalid arity: "+arguments.length);};d.b=c;d.a=b;d.c=a;return d}();function Vd(a,b,c,d){this.ca=a;this.ra=b;this.k=c;this.p=d;this.j=31850732;this.q=1536}k=Vd.prototype;k.toString=function(){return ec(this)};
k.H=function(){return this.k};k.T=function(){if(1<Ma(this.ca))return new Vd(Xb(this.ca),this.ra,this.k,null);var a=Cb(this.ra);return null==a?null:a};k.B=function(){var a=this.p;return null!=a?a:this.p=a=wc(this)};k.A=function(a,b){return Ic(this,b)};k.J=function(){return O(J,this.k)};k.N=function(){return C.a(this.ca,0)};k.S=function(){return 1<Ma(this.ca)?new Vd(Xb(this.ca),this.ra,this.k,null):null==this.ra?J:this.ra};k.D=function(){return this};k.Cb=function(){return this.ca};
k.Db=function(){return null==this.ra?J:this.ra};k.F=function(a,b){return new Vd(this.ca,this.ra,b,this.p)};k.G=function(a,b){return M(b,this)};k.Bb=function(){return null==this.ra?null:this.ra};Vd.prototype[Ea]=function(){return uc(this)};function Wd(a,b){return 0===Ma(a)?b:new Vd(a,b,null,null)}function Xd(a,b){a.add(b)}function rd(a){for(var b=[];;)if(D(a))b.push(G(a)),a=K(a);else return b}function Yd(a,b){if(Ec(a))return Q(a);for(var c=a,d=b,e=0;;)if(0<d&&D(c))c=K(c),d-=1,e+=1;else return e}
var $d=function Zd(b){return null==b?null:null==K(b)?D(G(b)):M(G(b),Zd(K(b)))},ae=function(){function a(a,b){return new V(null,function(){var c=D(a);return c?fd(c)?Wd(Yb(c),d.a(Zb(c),b)):M(G(c),d.a(H(c),b)):b},null,null)}function b(a){return new V(null,function(){return a},null,null)}function c(){return new V(null,function(){return null},null,null)}var d=null,e=function(){function a(c,d,e){var f=null;if(2<arguments.length){for(var f=0,q=Array(arguments.length-2);f<q.length;)q[f]=arguments[f+2],++f;
f=new F(q,0)}return b.call(this,c,d,f)}function b(a,c,e){return function q(a,b){return new V(null,function(){var c=D(a);return c?fd(c)?Wd(Yb(c),q(Zb(c),b)):M(G(c),q(H(c),b)):t(b)?q(G(b),K(b)):null},null,null)}(d.a(a,c),e)}a.i=2;a.f=function(a){var c=G(a);a=K(a);var d=G(a);a=H(a);return b(c,d,a)};a.d=b;return a}(),d=function(d,g,h){switch(arguments.length){case 0:return c.call(this);case 1:return b.call(this,d);case 2:return a.call(this,d,g);default:var l=null;if(2<arguments.length){for(var l=0,m=
Array(arguments.length-2);l<m.length;)m[l]=arguments[l+2],++l;l=new F(m,0)}return e.d(d,g,l)}throw Error("Invalid arity: "+arguments.length);};d.i=2;d.f=e.f;d.l=c;d.b=b;d.a=a;d.d=e.d;return d}(),be=function(){function a(a,b,c,d){return M(a,M(b,M(c,d)))}function b(a,b,c){return M(a,M(b,c))}var c=null,d=function(){function a(c,d,e,m,p){var q=null;if(4<arguments.length){for(var q=0,s=Array(arguments.length-4);q<s.length;)s[q]=arguments[q+4],++q;q=new F(s,0)}return b.call(this,c,d,e,m,q)}function b(a,
c,d,e,f){return M(a,M(c,M(d,M(e,$d(f)))))}a.i=4;a.f=function(a){var c=G(a);a=K(a);var d=G(a);a=K(a);var e=G(a);a=K(a);var p=G(a);a=H(a);return b(c,d,e,p,a)};a.d=b;return a}(),c=function(c,f,g,h,l){switch(arguments.length){case 1:return D(c);case 2:return M(c,f);case 3:return b.call(this,c,f,g);case 4:return a.call(this,c,f,g,h);default:var m=null;if(4<arguments.length){for(var m=0,p=Array(arguments.length-4);m<p.length;)p[m]=arguments[m+4],++m;m=new F(p,0)}return d.d(c,f,g,h,m)}throw Error("Invalid arity: "+
arguments.length);};c.i=4;c.f=d.f;c.b=function(a){return D(a)};c.a=function(a,b){return M(a,b)};c.c=b;c.n=a;c.d=d.d;return c}();function ce(a){return Qb(a)}
var de=function(){function a(){return Ob(Mc)}var b=null,c=function(){function a(c,d,h){var l=null;if(2<arguments.length){for(var l=0,m=Array(arguments.length-2);l<m.length;)m[l]=arguments[l+2],++l;l=new F(m,0)}return b.call(this,c,d,l)}function b(a,c,d){for(;;)if(a=Pb(a,c),t(d))c=G(d),d=K(d);else return a}a.i=2;a.f=function(a){var c=G(a);a=K(a);var d=G(a);a=H(a);return b(c,d,a)};a.d=b;return a}(),b=function(b,e,f){switch(arguments.length){case 0:return a.call(this);case 1:return b;case 2:return Pb(b,
e);default:var g=null;if(2<arguments.length){for(var g=0,h=Array(arguments.length-2);g<h.length;)h[g]=arguments[g+2],++g;g=new F(h,0)}return c.d(b,e,g)}throw Error("Invalid arity: "+arguments.length);};b.i=2;b.f=c.f;b.l=a;b.b=function(a){return a};b.a=function(a,b){return Pb(a,b)};b.d=c.d;return b}(),ee=function(){var a=null,b=function(){function a(c,f,g,h){var l=null;if(3<arguments.length){for(var l=0,m=Array(arguments.length-3);l<m.length;)m[l]=arguments[l+3],++l;l=new F(m,0)}return b.call(this,
c,f,g,l)}function b(a,c,d,h){for(;;)if(a=Rb(a,c,d),t(h))c=G(h),d=Lc(h),h=K(K(h));else return a}a.i=3;a.f=function(a){var c=G(a);a=K(a);var g=G(a);a=K(a);var h=G(a);a=H(a);return b(c,g,h,a)};a.d=b;return a}(),a=function(a,d,e,f){switch(arguments.length){case 3:return Rb(a,d,e);default:var g=null;if(3<arguments.length){for(var g=0,h=Array(arguments.length-3);g<h.length;)h[g]=arguments[g+3],++g;g=new F(h,0)}return b.d(a,d,e,g)}throw Error("Invalid arity: "+arguments.length);};a.i=3;a.f=b.f;a.c=function(a,
b,e){return Rb(a,b,e)};a.d=b.d;return a}(),fe=function(){var a=null,b=function(){function a(c,f,g){var h=null;if(2<arguments.length){for(var h=0,l=Array(arguments.length-2);h<l.length;)l[h]=arguments[h+2],++h;h=new F(l,0)}return b.call(this,c,f,h)}function b(a,c,d){for(;;)if(a=Sb(a,c),t(d))c=G(d),d=K(d);else return a}a.i=2;a.f=function(a){var c=G(a);a=K(a);var g=G(a);a=H(a);return b(c,g,a)};a.d=b;return a}(),a=function(a,d,e){switch(arguments.length){case 2:return Sb(a,d);default:var f=null;if(2<
arguments.length){for(var f=0,g=Array(arguments.length-2);f<g.length;)g[f]=arguments[f+2],++f;f=new F(g,0)}return b.d(a,d,f)}throw Error("Invalid arity: "+arguments.length);};a.i=2;a.f=b.f;a.a=function(a,b){return Sb(a,b)};a.d=b.d;return a}(),ge=function(){var a=null,b=function(){function a(c,f,g){var h=null;if(2<arguments.length){for(var h=0,l=Array(arguments.length-2);h<l.length;)l[h]=arguments[h+2],++h;h=new F(l,0)}return b.call(this,c,f,h)}function b(a,c,d){for(;;)if(a=Vb(a,c),t(d))c=G(d),d=K(d);
else return a}a.i=2;a.f=function(a){var c=G(a);a=K(a);var g=G(a);a=H(a);return b(c,g,a)};a.d=b;return a}(),a=function(a,d,e){switch(arguments.length){case 2:return Vb(a,d);default:var f=null;if(2<arguments.length){for(var f=0,g=Array(arguments.length-2);f<g.length;)g[f]=arguments[f+2],++f;f=new F(g,0)}return b.d(a,d,f)}throw Error("Invalid arity: "+arguments.length);};a.i=2;a.f=b.f;a.a=function(a,b){return Vb(a,b)};a.d=b.d;return a}();
function he(a,b,c){var d=D(c);if(0===b)return a.l?a.l():a.call(null);c=Va(d);var e=Wa(d);if(1===b)return a.b?a.b(c):a.b?a.b(c):a.call(null,c);var d=Va(e),f=Wa(e);if(2===b)return a.a?a.a(c,d):a.a?a.a(c,d):a.call(null,c,d);var e=Va(f),g=Wa(f);if(3===b)return a.c?a.c(c,d,e):a.c?a.c(c,d,e):a.call(null,c,d,e);var f=Va(g),h=Wa(g);if(4===b)return a.n?a.n(c,d,e,f):a.n?a.n(c,d,e,f):a.call(null,c,d,e,f);var g=Va(h),l=Wa(h);if(5===b)return a.r?a.r(c,d,e,f,g):a.r?a.r(c,d,e,f,g):a.call(null,c,d,e,f,g);var h=Va(l),
m=Wa(l);if(6===b)return a.P?a.P(c,d,e,f,g,h):a.P?a.P(c,d,e,f,g,h):a.call(null,c,d,e,f,g,h);var l=Va(m),p=Wa(m);if(7===b)return a.ia?a.ia(c,d,e,f,g,h,l):a.ia?a.ia(c,d,e,f,g,h,l):a.call(null,c,d,e,f,g,h,l);var m=Va(p),q=Wa(p);if(8===b)return a.Ga?a.Ga(c,d,e,f,g,h,l,m):a.Ga?a.Ga(c,d,e,f,g,h,l,m):a.call(null,c,d,e,f,g,h,l,m);var p=Va(q),s=Wa(q);if(9===b)return a.Ha?a.Ha(c,d,e,f,g,h,l,m,p):a.Ha?a.Ha(c,d,e,f,g,h,l,m,p):a.call(null,c,d,e,f,g,h,l,m,p);var q=Va(s),u=Wa(s);if(10===b)return a.va?a.va(c,d,e,
f,g,h,l,m,p,q):a.va?a.va(c,d,e,f,g,h,l,m,p,q):a.call(null,c,d,e,f,g,h,l,m,p,q);var s=Va(u),v=Wa(u);if(11===b)return a.wa?a.wa(c,d,e,f,g,h,l,m,p,q,s):a.wa?a.wa(c,d,e,f,g,h,l,m,p,q,s):a.call(null,c,d,e,f,g,h,l,m,p,q,s);var u=Va(v),y=Wa(v);if(12===b)return a.xa?a.xa(c,d,e,f,g,h,l,m,p,q,s,u):a.xa?a.xa(c,d,e,f,g,h,l,m,p,q,s,u):a.call(null,c,d,e,f,g,h,l,m,p,q,s,u);var v=Va(y),B=Wa(y);if(13===b)return a.ya?a.ya(c,d,e,f,g,h,l,m,p,q,s,u,v):a.ya?a.ya(c,d,e,f,g,h,l,m,p,q,s,u,v):a.call(null,c,d,e,f,g,h,l,m,p,
q,s,u,v);var y=Va(B),E=Wa(B);if(14===b)return a.za?a.za(c,d,e,f,g,h,l,m,p,q,s,u,v,y):a.za?a.za(c,d,e,f,g,h,l,m,p,q,s,u,v,y):a.call(null,c,d,e,f,g,h,l,m,p,q,s,u,v,y);var B=Va(E),N=Wa(E);if(15===b)return a.Aa?a.Aa(c,d,e,f,g,h,l,m,p,q,s,u,v,y,B):a.Aa?a.Aa(c,d,e,f,g,h,l,m,p,q,s,u,v,y,B):a.call(null,c,d,e,f,g,h,l,m,p,q,s,u,v,y,B);var E=Va(N),Y=Wa(N);if(16===b)return a.Ba?a.Ba(c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E):a.Ba?a.Ba(c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E):a.call(null,c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E);var N=
Va(Y),ra=Wa(Y);if(17===b)return a.Ca?a.Ca(c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E,N):a.Ca?a.Ca(c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E,N):a.call(null,c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E,N);var Y=Va(ra),Pa=Wa(ra);if(18===b)return a.Da?a.Da(c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E,N,Y):a.Da?a.Da(c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E,N,Y):a.call(null,c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E,N,Y);ra=Va(Pa);Pa=Wa(Pa);if(19===b)return a.Ea?a.Ea(c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E,N,Y,ra):a.Ea?a.Ea(c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E,N,Y,ra):a.call(null,
c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E,N,Y,ra);var I=Va(Pa);Wa(Pa);if(20===b)return a.Fa?a.Fa(c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E,N,Y,ra,I):a.Fa?a.Fa(c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E,N,Y,ra,I):a.call(null,c,d,e,f,g,h,l,m,p,q,s,u,v,y,B,E,N,Y,ra,I);throw Error("Only up to 20 arguments supported on functions");}
var T=function(){function a(a,b,c,d,e){b=be.n(b,c,d,e);c=a.i;return a.f?(d=Yd(b,c+1),d<=c?he(a,d,b):a.f(b)):a.apply(a,rd(b))}function b(a,b,c,d){b=be.c(b,c,d);c=a.i;return a.f?(d=Yd(b,c+1),d<=c?he(a,d,b):a.f(b)):a.apply(a,rd(b))}function c(a,b,c){b=be.a(b,c);c=a.i;if(a.f){var d=Yd(b,c+1);return d<=c?he(a,d,b):a.f(b)}return a.apply(a,rd(b))}function d(a,b){var c=a.i;if(a.f){var d=Yd(b,c+1);return d<=c?he(a,d,b):a.f(b)}return a.apply(a,rd(b))}var e=null,f=function(){function a(c,d,e,f,g,u){var v=null;
if(5<arguments.length){for(var v=0,y=Array(arguments.length-5);v<y.length;)y[v]=arguments[v+5],++v;v=new F(y,0)}return b.call(this,c,d,e,f,g,v)}function b(a,c,d,e,f,g){c=M(c,M(d,M(e,M(f,$d(g)))));d=a.i;return a.f?(e=Yd(c,d+1),e<=d?he(a,e,c):a.f(c)):a.apply(a,rd(c))}a.i=5;a.f=function(a){var c=G(a);a=K(a);var d=G(a);a=K(a);var e=G(a);a=K(a);var f=G(a);a=K(a);var g=G(a);a=H(a);return b(c,d,e,f,g,a)};a.d=b;return a}(),e=function(e,h,l,m,p,q){switch(arguments.length){case 2:return d.call(this,e,h);case 3:return c.call(this,
e,h,l);case 4:return b.call(this,e,h,l,m);case 5:return a.call(this,e,h,l,m,p);default:var s=null;if(5<arguments.length){for(var s=0,u=Array(arguments.length-5);s<u.length;)u[s]=arguments[s+5],++s;s=new F(u,0)}return f.d(e,h,l,m,p,s)}throw Error("Invalid arity: "+arguments.length);};e.i=5;e.f=f.f;e.a=d;e.c=c;e.n=b;e.r=a;e.d=f.d;return e}(),ie=function(){function a(a,b,c,d,e,f){var g=O,v=Vc(a);b=b.r?b.r(v,c,d,e,f):b.call(null,v,c,d,e,f);return g(a,b)}function b(a,b,c,d,e){var f=O,g=Vc(a);b=b.n?b.n(g,
c,d,e):b.call(null,g,c,d,e);return f(a,b)}function c(a,b,c,d){var e=O,f=Vc(a);b=b.c?b.c(f,c,d):b.call(null,f,c,d);return e(a,b)}function d(a,b,c){var d=O,e=Vc(a);b=b.a?b.a(e,c):b.call(null,e,c);return d(a,b)}function e(a,b){var c=O,d;d=Vc(a);d=b.b?b.b(d):b.call(null,d);return c(a,d)}var f=null,g=function(){function a(c,d,e,f,g,h,y){var B=null;if(6<arguments.length){for(var B=0,E=Array(arguments.length-6);B<E.length;)E[B]=arguments[B+6],++B;B=new F(E,0)}return b.call(this,c,d,e,f,g,h,B)}function b(a,
c,d,e,f,g,h){return O(a,T.d(c,Vc(a),d,e,f,Kc([g,h],0)))}a.i=6;a.f=function(a){var c=G(a);a=K(a);var d=G(a);a=K(a);var e=G(a);a=K(a);var f=G(a);a=K(a);var g=G(a);a=K(a);var h=G(a);a=H(a);return b(c,d,e,f,g,h,a)};a.d=b;return a}(),f=function(f,l,m,p,q,s,u){switch(arguments.length){case 2:return e.call(this,f,l);case 3:return d.call(this,f,l,m);case 4:return c.call(this,f,l,m,p);case 5:return b.call(this,f,l,m,p,q);case 6:return a.call(this,f,l,m,p,q,s);default:var v=null;if(6<arguments.length){for(var v=
0,y=Array(arguments.length-6);v<y.length;)y[v]=arguments[v+6],++v;v=new F(y,0)}return g.d(f,l,m,p,q,s,v)}throw Error("Invalid arity: "+arguments.length);};f.i=6;f.f=g.f;f.a=e;f.c=d;f.n=c;f.r=b;f.P=a;f.d=g.d;return f}(),je=function(){function a(a,b){return!sc.a(a,b)}var b=null,c=function(){function a(c,d,h){var l=null;if(2<arguments.length){for(var l=0,m=Array(arguments.length-2);l<m.length;)m[l]=arguments[l+2],++l;l=new F(m,0)}return b.call(this,c,d,l)}function b(a,c,d){return Aa(T.n(sc,a,c,d))}a.i=
2;a.f=function(a){var c=G(a);a=K(a);var d=G(a);a=H(a);return b(c,d,a)};a.d=b;return a}(),b=function(b,e,f){switch(arguments.length){case 1:return!1;case 2:return a.call(this,b,e);default:var g=null;if(2<arguments.length){for(var g=0,h=Array(arguments.length-2);g<h.length;)h[g]=arguments[g+2],++g;g=new F(h,0)}return c.d(b,e,g)}throw Error("Invalid arity: "+arguments.length);};b.i=2;b.f=c.f;b.b=function(){return!1};b.a=a;b.d=c.d;return b}(),qe=function ke(){"undefined"===typeof ja&&(ja=function(b,c){this.pc=
b;this.oc=c;this.q=0;this.j=393216},ja.prototype.ga=function(){return!1},ja.prototype.next=function(){return Error("No such element")},ja.prototype.H=function(){return this.oc},ja.prototype.F=function(b,c){return new ja(this.pc,c)},ja.Yb=!0,ja.Xb="cljs.core/t12660",ja.nc=function(b){return Lb(b,"cljs.core/t12660")});return new ja(ke,new pa(null,5,[le,54,me,2998,ne,3,oe,2994,pe,"/Users/davidnolen/development/clojure/mori/out-mori-adv/cljs/core.cljs"],null))};function re(a,b){this.C=a;this.m=b}
re.prototype.ga=function(){return this.m<this.C.length};re.prototype.next=function(){var a=this.C.charAt(this.m);this.m+=1;return a};function se(a,b){this.e=a;this.m=b}se.prototype.ga=function(){return this.m<this.e.length};se.prototype.next=function(){var a=this.e[this.m];this.m+=1;return a};var te={},ue={};function ve(a,b){this.eb=a;this.Qa=b}ve.prototype.ga=function(){this.eb===te?(this.eb=ue,this.Qa=D(this.Qa)):this.eb===this.Qa&&(this.Qa=K(this.eb));return null!=this.Qa};
ve.prototype.next=function(){if(Aa(this.ga()))throw Error("No such element");this.eb=this.Qa;return G(this.Qa)};function we(a){if(null==a)return qe();if("string"===typeof a)return new re(a,0);if(a instanceof Array)return new se(a,0);if(a?t(t(null)?null:a.vb)||(a.yb?0:w(bc,a)):w(bc,a))return cc(a);if(ld(a))return new ve(te,a);throw Error([z("Cannot create iterator from "),z(a)].join(""));}function xe(a,b){this.fa=a;this.$b=b}
xe.prototype.step=function(a){for(var b=this;;){if(t(function(){var c=null!=a.X;return c?b.$b.ga():c}()))if(Ac(function(){var c=b.$b.next();return b.fa.a?b.fa.a(a,c):b.fa.call(null,a,c)}()))null!=a.M&&(a.M.X=null);else continue;break}return null==a.X?null:b.fa.b?b.fa.b(a):b.fa.call(null,a)};
function ye(a,b){var c=function(){function a(b,c){b.first=c;b.M=new ze(b.X,null,null,null);b.X=null;return b.M}function b(a){(Ac(a)?qb(a):a).X=null;return a}var c=null,c=function(c,f){switch(arguments.length){case 1:return b.call(this,c);case 2:return a.call(this,c,f)}throw Error("Invalid arity: "+arguments.length);};c.b=b;c.a=a;return c}();return new xe(a.b?a.b(c):a.call(null,c),b)}function Ae(a,b,c){this.fa=a;this.Kb=b;this.ac=c}
Ae.prototype.ga=function(){for(var a=D(this.Kb);;)if(null!=a){var b=G(a);if(Aa(b.ga()))return!1;a=K(a)}else return!0};Ae.prototype.next=function(){for(var a=this.Kb.length,b=0;;)if(b<a)this.ac[b]=this.Kb[b].next(),b+=1;else break;return Jc.a(this.ac,0)};Ae.prototype.step=function(a){for(;;){var b;b=(b=null!=a.X)?this.ga():b;if(t(b))if(Ac(T.a(this.fa,M(a,this.next()))))null!=a.M&&(a.M.X=null);else continue;break}return null==a.X?null:this.fa.b?this.fa.b(a):this.fa.call(null,a)};
var Be=function(){function a(a,b,c){var g=function(){function a(b,c){b.first=c;b.M=new ze(b.X,null,null,null);b.X=null;return b.M}function b(a){a=Ac(a)?qb(a):a;a.X=null;return a}var c=null,c=function(c,d){switch(arguments.length){case 1:return b.call(this,c);case 2:return a.call(this,c,d)}throw Error("Invalid arity: "+arguments.length);};c.b=b;c.a=a;return c}();return new Ae(a.b?a.b(g):a.call(null,g),b,c)}function b(a,b){return c.c(a,b,Array(b.length))}var c=null,c=function(c,e,f){switch(arguments.length){case 2:return b.call(this,
c,e);case 3:return a.call(this,c,e,f)}throw Error("Invalid arity: "+arguments.length);};c.a=b;c.c=a;return c}();function ze(a,b,c,d){this.X=a;this.first=b;this.M=c;this.k=d;this.q=0;this.j=31719628}k=ze.prototype;k.T=function(){null!=this.X&&Cb(this);return null==this.M?null:Cb(this.M)};k.N=function(){null!=this.X&&Cb(this);return null==this.M?null:this.first};k.S=function(){null!=this.X&&Cb(this);return null==this.M?J:this.M};
k.D=function(){null!=this.X&&this.X.step(this);return null==this.M?null:this};k.B=function(){return wc(this)};k.A=function(a,b){return null!=Cb(this)?Ic(this,b):cd(b)&&null==D(b)};k.J=function(){return J};k.G=function(a,b){return M(b,Cb(this))};k.F=function(a,b){return new ze(this.X,this.first,this.M,b)};ze.prototype[Ea]=function(){return uc(this)};
var Ce=function(){function a(a){return kd(a)?a:(a=D(a))?a:J}var b=null,c=function(){function a(c,d,h){var l=null;if(2<arguments.length){for(var l=0,m=Array(arguments.length-2);l<m.length;)m[l]=arguments[l+2],++l;l=new F(m,0)}return b.call(this,c,d,l)}function b(a,c,d){d=rd(M(c,d));c=[];d=D(d);for(var e=null,m=0,p=0;;)if(p<m){var q=e.Q(null,p);c.push(we(q));p+=1}else if(d=D(d))e=d,fd(e)?(d=Yb(e),p=Zb(e),e=d,m=Q(d),d=p):(d=G(e),c.push(we(d)),d=K(e),e=null,m=0),p=0;else break;return new ze(Be.c(a,c,
Array(c.length)),null,null,null)}a.i=2;a.f=function(a){var c=G(a);a=K(a);var d=G(a);a=H(a);return b(c,d,a)};a.d=b;return a}(),b=function(b,e,f){switch(arguments.length){case 1:return a.call(this,b);case 2:return new ze(ye(b,we(e)),null,null,null);default:var g=null;if(2<arguments.length){for(var g=0,h=Array(arguments.length-2);g<h.length;)h[g]=arguments[g+2],++g;g=new F(h,0)}return c.d(b,e,g)}throw Error("Invalid arity: "+arguments.length);};b.i=2;b.f=c.f;b.b=a;b.a=function(a,b){return new ze(ye(a,
we(b)),null,null,null)};b.d=c.d;return b}();function Ee(a,b){for(;;){if(null==D(b))return!0;var c;c=G(b);c=a.b?a.b(c):a.call(null,c);if(t(c)){c=a;var d=K(b);a=c;b=d}else return!1}}function Fe(a,b){for(;;)if(D(b)){var c;c=G(b);c=a.b?a.b(c):a.call(null,c);if(t(c))return c;c=a;var d=K(b);a=c;b=d}else return null}function Ge(a){if("number"===typeof a&&Aa(isNaN(a))&&Infinity!==a&&parseFloat(a)===parseInt(a,10))return 0===(a&1);throw Error([z("Argument must be an integer: "),z(a)].join(""));}
function He(a){return function(){function b(b,c){return Aa(a.a?a.a(b,c):a.call(null,b,c))}function c(b){return Aa(a.b?a.b(b):a.call(null,b))}function d(){return Aa(a.l?a.l():a.call(null))}var e=null,f=function(){function b(a,d,e){var f=null;if(2<arguments.length){for(var f=0,g=Array(arguments.length-2);f<g.length;)g[f]=arguments[f+2],++f;f=new F(g,0)}return c.call(this,a,d,f)}function c(b,d,e){return Aa(T.n(a,b,d,e))}b.i=2;b.f=function(a){var b=G(a);a=K(a);var d=G(a);a=H(a);return c(b,d,a)};b.d=c;
return b}(),e=function(a,e,l){switch(arguments.length){case 0:return d.call(this);case 1:return c.call(this,a);case 2:return b.call(this,a,e);default:var m=null;if(2<arguments.length){for(var m=0,p=Array(arguments.length-2);m<p.length;)p[m]=arguments[m+2],++m;m=new F(p,0)}return f.d(a,e,m)}throw Error("Invalid arity: "+arguments.length);};e.i=2;e.f=f.f;e.l=d;e.b=c;e.a=b;e.d=f.d;return e}()}
var Ie=function(){function a(a,b,c){return function(){function d(h,l,m){h=c.c?c.c(h,l,m):c.call(null,h,l,m);h=b.b?b.b(h):b.call(null,h);return a.b?a.b(h):a.call(null,h)}function l(d,h){var l;l=c.a?c.a(d,h):c.call(null,d,h);l=b.b?b.b(l):b.call(null,l);return a.b?a.b(l):a.call(null,l)}function m(d){d=c.b?c.b(d):c.call(null,d);d=b.b?b.b(d):b.call(null,d);return a.b?a.b(d):a.call(null,d)}function p(){var d;d=c.l?c.l():c.call(null);d=b.b?b.b(d):b.call(null,d);return a.b?a.b(d):a.call(null,d)}var q=null,
s=function(){function d(a,b,c,e){var f=null;if(3<arguments.length){for(var f=0,g=Array(arguments.length-3);f<g.length;)g[f]=arguments[f+3],++f;f=new F(g,0)}return h.call(this,a,b,c,f)}function h(d,l,m,p){d=T.r(c,d,l,m,p);d=b.b?b.b(d):b.call(null,d);return a.b?a.b(d):a.call(null,d)}d.i=3;d.f=function(a){var b=G(a);a=K(a);var c=G(a);a=K(a);var d=G(a);a=H(a);return h(b,c,d,a)};d.d=h;return d}(),q=function(a,b,c,e){switch(arguments.length){case 0:return p.call(this);case 1:return m.call(this,a);case 2:return l.call(this,
a,b);case 3:return d.call(this,a,b,c);default:var f=null;if(3<arguments.length){for(var f=0,g=Array(arguments.length-3);f<g.length;)g[f]=arguments[f+3],++f;f=new F(g,0)}return s.d(a,b,c,f)}throw Error("Invalid arity: "+arguments.length);};q.i=3;q.f=s.f;q.l=p;q.b=m;q.a=l;q.c=d;q.d=s.d;return q}()}function b(a,b){return function(){function c(d,g,h){d=b.c?b.c(d,g,h):b.call(null,d,g,h);return a.b?a.b(d):a.call(null,d)}function d(c,g){var h=b.a?b.a(c,g):b.call(null,c,g);return a.b?a.b(h):a.call(null,h)}
function l(c){c=b.b?b.b(c):b.call(null,c);return a.b?a.b(c):a.call(null,c)}function m(){var c=b.l?b.l():b.call(null);return a.b?a.b(c):a.call(null,c)}var p=null,q=function(){function c(a,b,e,f){var g=null;if(3<arguments.length){for(var g=0,h=Array(arguments.length-3);g<h.length;)h[g]=arguments[g+3],++g;g=new F(h,0)}return d.call(this,a,b,e,g)}function d(c,g,h,l){c=T.r(b,c,g,h,l);return a.b?a.b(c):a.call(null,c)}c.i=3;c.f=function(a){var b=G(a);a=K(a);var c=G(a);a=K(a);var e=G(a);a=H(a);return d(b,
c,e,a)};c.d=d;return c}(),p=function(a,b,e,f){switch(arguments.length){case 0:return m.call(this);case 1:return l.call(this,a);case 2:return d.call(this,a,b);case 3:return c.call(this,a,b,e);default:var p=null;if(3<arguments.length){for(var p=0,E=Array(arguments.length-3);p<E.length;)E[p]=arguments[p+3],++p;p=new F(E,0)}return q.d(a,b,e,p)}throw Error("Invalid arity: "+arguments.length);};p.i=3;p.f=q.f;p.l=m;p.b=l;p.a=d;p.c=c;p.d=q.d;return p}()}var c=null,d=function(){function a(c,d,e,m){var p=null;
if(3<arguments.length){for(var p=0,q=Array(arguments.length-3);p<q.length;)q[p]=arguments[p+3],++p;p=new F(q,0)}return b.call(this,c,d,e,p)}function b(a,c,d,e){return function(a){return function(){function b(a){var d=null;if(0<arguments.length){for(var d=0,e=Array(arguments.length-0);d<e.length;)e[d]=arguments[d+0],++d;d=new F(e,0)}return c.call(this,d)}function c(b){b=T.a(G(a),b);for(var d=K(a);;)if(d)b=G(d).call(null,b),d=K(d);else return b}b.i=0;b.f=function(a){a=D(a);return c(a)};b.d=c;return b}()}(Jd(be.n(a,
c,d,e)))}a.i=3;a.f=function(a){var c=G(a);a=K(a);var d=G(a);a=K(a);var e=G(a);a=H(a);return b(c,d,e,a)};a.d=b;return a}(),c=function(c,f,g,h){switch(arguments.length){case 0:return ud;case 1:return c;case 2:return b.call(this,c,f);case 3:return a.call(this,c,f,g);default:var l=null;if(3<arguments.length){for(var l=0,m=Array(arguments.length-3);l<m.length;)m[l]=arguments[l+3],++l;l=new F(m,0)}return d.d(c,f,g,l)}throw Error("Invalid arity: "+arguments.length);};c.i=3;c.f=d.f;c.l=function(){return ud};
c.b=function(a){return a};c.a=b;c.c=a;c.d=d.d;return c}(),Je=function(){function a(a,b,c,d){return function(){function e(m,p,q){return a.P?a.P(b,c,d,m,p,q):a.call(null,b,c,d,m,p,q)}function p(e,m){return a.r?a.r(b,c,d,e,m):a.call(null,b,c,d,e,m)}function q(e){return a.n?a.n(b,c,d,e):a.call(null,b,c,d,e)}function s(){return a.c?a.c(b,c,d):a.call(null,b,c,d)}var u=null,v=function(){function e(a,b,c,d){var f=null;if(3<arguments.length){for(var f=0,g=Array(arguments.length-3);f<g.length;)g[f]=arguments[f+
3],++f;f=new F(g,0)}return m.call(this,a,b,c,f)}function m(e,p,q,s){return T.d(a,b,c,d,e,Kc([p,q,s],0))}e.i=3;e.f=function(a){var b=G(a);a=K(a);var c=G(a);a=K(a);var d=G(a);a=H(a);return m(b,c,d,a)};e.d=m;return e}(),u=function(a,b,c,d){switch(arguments.length){case 0:return s.call(this);case 1:return q.call(this,a);case 2:return p.call(this,a,b);case 3:return e.call(this,a,b,c);default:var f=null;if(3<arguments.length){for(var f=0,g=Array(arguments.length-3);f<g.length;)g[f]=arguments[f+3],++f;f=
new F(g,0)}return v.d(a,b,c,f)}throw Error("Invalid arity: "+arguments.length);};u.i=3;u.f=v.f;u.l=s;u.b=q;u.a=p;u.c=e;u.d=v.d;return u}()}function b(a,b,c){return function(){function d(e,l,m){return a.r?a.r(b,c,e,l,m):a.call(null,b,c,e,l,m)}function e(d,l){return a.n?a.n(b,c,d,l):a.call(null,b,c,d,l)}function p(d){return a.c?a.c(b,c,d):a.call(null,b,c,d)}function q(){return a.a?a.a(b,c):a.call(null,b,c)}var s=null,u=function(){function d(a,b,c,f){var g=null;if(3<arguments.length){for(var g=0,h=Array(arguments.length-
3);g<h.length;)h[g]=arguments[g+3],++g;g=new F(h,0)}return e.call(this,a,b,c,g)}function e(d,l,m,p){return T.d(a,b,c,d,l,Kc([m,p],0))}d.i=3;d.f=function(a){var b=G(a);a=K(a);var c=G(a);a=K(a);var d=G(a);a=H(a);return e(b,c,d,a)};d.d=e;return d}(),s=function(a,b,c,f){switch(arguments.length){case 0:return q.call(this);case 1:return p.call(this,a);case 2:return e.call(this,a,b);case 3:return d.call(this,a,b,c);default:var g=null;if(3<arguments.length){for(var g=0,h=Array(arguments.length-3);g<h.length;)h[g]=
arguments[g+3],++g;g=new F(h,0)}return u.d(a,b,c,g)}throw Error("Invalid arity: "+arguments.length);};s.i=3;s.f=u.f;s.l=q;s.b=p;s.a=e;s.c=d;s.d=u.d;return s}()}function c(a,b){return function(){function c(d,e,h){return a.n?a.n(b,d,e,h):a.call(null,b,d,e,h)}function d(c,e){return a.c?a.c(b,c,e):a.call(null,b,c,e)}function e(c){return a.a?a.a(b,c):a.call(null,b,c)}function p(){return a.b?a.b(b):a.call(null,b)}var q=null,s=function(){function c(a,b,e,f){var g=null;if(3<arguments.length){for(var g=0,
h=Array(arguments.length-3);g<h.length;)h[g]=arguments[g+3],++g;g=new F(h,0)}return d.call(this,a,b,e,g)}function d(c,e,h,l){return T.d(a,b,c,e,h,Kc([l],0))}c.i=3;c.f=function(a){var b=G(a);a=K(a);var c=G(a);a=K(a);var e=G(a);a=H(a);return d(b,c,e,a)};c.d=d;return c}(),q=function(a,b,f,g){switch(arguments.length){case 0:return p.call(this);case 1:return e.call(this,a);case 2:return d.call(this,a,b);case 3:return c.call(this,a,b,f);default:var q=null;if(3<arguments.length){for(var q=0,N=Array(arguments.length-
3);q<N.length;)N[q]=arguments[q+3],++q;q=new F(N,0)}return s.d(a,b,f,q)}throw Error("Invalid arity: "+arguments.length);};q.i=3;q.f=s.f;q.l=p;q.b=e;q.a=d;q.c=c;q.d=s.d;return q}()}var d=null,e=function(){function a(c,d,e,f,q){var s=null;if(4<arguments.length){for(var s=0,u=Array(arguments.length-4);s<u.length;)u[s]=arguments[s+4],++s;s=new F(u,0)}return b.call(this,c,d,e,f,s)}function b(a,c,d,e,f){return function(){function b(a){var c=null;if(0<arguments.length){for(var c=0,d=Array(arguments.length-
0);c<d.length;)d[c]=arguments[c+0],++c;c=new F(d,0)}return g.call(this,c)}function g(b){return T.r(a,c,d,e,ae.a(f,b))}b.i=0;b.f=function(a){a=D(a);return g(a)};b.d=g;return b}()}a.i=4;a.f=function(a){var c=G(a);a=K(a);var d=G(a);a=K(a);var e=G(a);a=K(a);var f=G(a);a=H(a);return b(c,d,e,f,a)};a.d=b;return a}(),d=function(d,g,h,l,m){switch(arguments.length){case 1:return d;case 2:return c.call(this,d,g);case 3:return b.call(this,d,g,h);case 4:return a.call(this,d,g,h,l);default:var p=null;if(4<arguments.length){for(var p=
0,q=Array(arguments.length-4);p<q.length;)q[p]=arguments[p+4],++p;p=new F(q,0)}return e.d(d,g,h,l,p)}throw Error("Invalid arity: "+arguments.length);};d.i=4;d.f=e.f;d.b=function(a){return a};d.a=c;d.c=b;d.n=a;d.d=e.d;return d}(),Ke=function(){function a(a,b,c,d){return function(){function l(l,m,p){l=null==l?b:l;m=null==m?c:m;p=null==p?d:p;return a.c?a.c(l,m,p):a.call(null,l,m,p)}function m(d,h){var l=null==d?b:d,m=null==h?c:h;return a.a?a.a(l,m):a.call(null,l,m)}var p=null,q=function(){function l(a,
b,c,d){var e=null;if(3<arguments.length){for(var e=0,f=Array(arguments.length-3);e<f.length;)f[e]=arguments[e+3],++e;e=new F(f,0)}return m.call(this,a,b,c,e)}function m(l,p,q,s){return T.r(a,null==l?b:l,null==p?c:p,null==q?d:q,s)}l.i=3;l.f=function(a){var b=G(a);a=K(a);var c=G(a);a=K(a);var d=G(a);a=H(a);return m(b,c,d,a)};l.d=m;return l}(),p=function(a,b,c,d){switch(arguments.length){case 2:return m.call(this,a,b);case 3:return l.call(this,a,b,c);default:var e=null;if(3<arguments.length){for(var e=
0,f=Array(arguments.length-3);e<f.length;)f[e]=arguments[e+3],++e;e=new F(f,0)}return q.d(a,b,c,e)}throw Error("Invalid arity: "+arguments.length);};p.i=3;p.f=q.f;p.a=m;p.c=l;p.d=q.d;return p}()}function b(a,b,c){return function(){function d(h,l,m){h=null==h?b:h;l=null==l?c:l;return a.c?a.c(h,l,m):a.call(null,h,l,m)}function l(d,h){var l=null==d?b:d,m=null==h?c:h;return a.a?a.a(l,m):a.call(null,l,m)}var m=null,p=function(){function d(a,b,c,e){var f=null;if(3<arguments.length){for(var f=0,g=Array(arguments.length-
3);f<g.length;)g[f]=arguments[f+3],++f;f=new F(g,0)}return h.call(this,a,b,c,f)}function h(d,l,m,p){return T.r(a,null==d?b:d,null==l?c:l,m,p)}d.i=3;d.f=function(a){var b=G(a);a=K(a);var c=G(a);a=K(a);var d=G(a);a=H(a);return h(b,c,d,a)};d.d=h;return d}(),m=function(a,b,c,e){switch(arguments.length){case 2:return l.call(this,a,b);case 3:return d.call(this,a,b,c);default:var f=null;if(3<arguments.length){for(var f=0,g=Array(arguments.length-3);f<g.length;)g[f]=arguments[f+3],++f;f=new F(g,0)}return p.d(a,
b,c,f)}throw Error("Invalid arity: "+arguments.length);};m.i=3;m.f=p.f;m.a=l;m.c=d;m.d=p.d;return m}()}function c(a,b){return function(){function c(d,g,h){d=null==d?b:d;return a.c?a.c(d,g,h):a.call(null,d,g,h)}function d(c,g){var h=null==c?b:c;return a.a?a.a(h,g):a.call(null,h,g)}function l(c){c=null==c?b:c;return a.b?a.b(c):a.call(null,c)}var m=null,p=function(){function c(a,b,e,f){var g=null;if(3<arguments.length){for(var g=0,h=Array(arguments.length-3);g<h.length;)h[g]=arguments[g+3],++g;g=new F(h,
0)}return d.call(this,a,b,e,g)}function d(c,g,h,l){return T.r(a,null==c?b:c,g,h,l)}c.i=3;c.f=function(a){var b=G(a);a=K(a);var c=G(a);a=K(a);var e=G(a);a=H(a);return d(b,c,e,a)};c.d=d;return c}(),m=function(a,b,e,f){switch(arguments.length){case 1:return l.call(this,a);case 2:return d.call(this,a,b);case 3:return c.call(this,a,b,e);default:var m=null;if(3<arguments.length){for(var m=0,B=Array(arguments.length-3);m<B.length;)B[m]=arguments[m+3],++m;m=new F(B,0)}return p.d(a,b,e,m)}throw Error("Invalid arity: "+
arguments.length);};m.i=3;m.f=p.f;m.b=l;m.a=d;m.c=c;m.d=p.d;return m}()}var d=null,d=function(d,f,g,h){switch(arguments.length){case 2:return c.call(this,d,f);case 3:return b.call(this,d,f,g);case 4:return a.call(this,d,f,g,h)}throw Error("Invalid arity: "+arguments.length);};d.a=c;d.c=b;d.n=a;return d}(),Le=function(){function a(a,b){return new V(null,function(){var f=D(b);if(f){if(fd(f)){for(var g=Yb(f),h=Q(g),l=Td(h),m=0;;)if(m<h){var p=function(){var b=C.a(g,m);return a.b?a.b(b):a.call(null,b)}();
null!=p&&l.add(p);m+=1}else break;return Wd(l.ca(),c.a(a,Zb(f)))}h=function(){var b=G(f);return a.b?a.b(b):a.call(null,b)}();return null==h?c.a(a,H(f)):M(h,c.a(a,H(f)))}return null},null,null)}function b(a){return function(b){return function(){function c(f,g){var h=a.b?a.b(g):a.call(null,g);return null==h?f:b.a?b.a(f,h):b.call(null,f,h)}function g(a){return b.b?b.b(a):b.call(null,a)}function h(){return b.l?b.l():b.call(null)}var l=null,l=function(a,b){switch(arguments.length){case 0:return h.call(this);
case 1:return g.call(this,a);case 2:return c.call(this,a,b)}throw Error("Invalid arity: "+arguments.length);};l.l=h;l.b=g;l.a=c;return l}()}}var c=null,c=function(c,e){switch(arguments.length){case 1:return b.call(this,c);case 2:return a.call(this,c,e)}throw Error("Invalid arity: "+arguments.length);};c.b=b;c.a=a;return c}();function Me(a){this.state=a;this.q=0;this.j=32768}Me.prototype.Ra=function(){return this.state};Me.prototype.bb=function(a,b){return this.state=b};
var Ne=function(){function a(a,b){return function g(b,c){return new V(null,function(){var e=D(c);if(e){if(fd(e)){for(var p=Yb(e),q=Q(p),s=Td(q),u=0;;)if(u<q){var v=function(){var c=b+u,e=C.a(p,u);return a.a?a.a(c,e):a.call(null,c,e)}();null!=v&&s.add(v);u+=1}else break;return Wd(s.ca(),g(b+q,Zb(e)))}q=function(){var c=G(e);return a.a?a.a(b,c):a.call(null,b,c)}();return null==q?g(b+1,H(e)):M(q,g(b+1,H(e)))}return null},null,null)}(0,b)}function b(a){return function(b){return function(c){return function(){function g(g,
h){var l=c.bb(0,c.Ra(null)+1),l=a.a?a.a(l,h):a.call(null,l,h);return null==l?g:b.a?b.a(g,l):b.call(null,g,l)}function h(a){return b.b?b.b(a):b.call(null,a)}function l(){return b.l?b.l():b.call(null)}var m=null,m=function(a,b){switch(arguments.length){case 0:return l.call(this);case 1:return h.call(this,a);case 2:return g.call(this,a,b)}throw Error("Invalid arity: "+arguments.length);};m.l=l;m.b=h;m.a=g;return m}()}(new Me(-1))}}var c=null,c=function(c,e){switch(arguments.length){case 1:return b.call(this,
c);case 2:return a.call(this,c,e)}throw Error("Invalid arity: "+arguments.length);};c.b=b;c.a=a;return c}(),Oe=function(){function a(a,b,c,d){return new V(null,function(){var f=D(b),q=D(c),s=D(d);if(f&&q&&s){var u=M,v;v=G(f);var y=G(q),B=G(s);v=a.c?a.c(v,y,B):a.call(null,v,y,B);f=u(v,e.n(a,H(f),H(q),H(s)))}else f=null;return f},null,null)}function b(a,b,c){return new V(null,function(){var d=D(b),f=D(c);if(d&&f){var q=M,s;s=G(d);var u=G(f);s=a.a?a.a(s,u):a.call(null,s,u);d=q(s,e.c(a,H(d),H(f)))}else d=
null;return d},null,null)}function c(a,b){return new V(null,function(){var c=D(b);if(c){if(fd(c)){for(var d=Yb(c),f=Q(d),q=Td(f),s=0;;)if(s<f)Xd(q,function(){var b=C.a(d,s);return a.b?a.b(b):a.call(null,b)}()),s+=1;else break;return Wd(q.ca(),e.a(a,Zb(c)))}return M(function(){var b=G(c);return a.b?a.b(b):a.call(null,b)}(),e.a(a,H(c)))}return null},null,null)}function d(a){return function(b){return function(){function c(d,e){var f=a.b?a.b(e):a.call(null,e);return b.a?b.a(d,f):b.call(null,d,f)}function d(a){return b.b?
b.b(a):b.call(null,a)}function e(){return b.l?b.l():b.call(null)}var f=null,s=function(){function c(a,b,e){var f=null;if(2<arguments.length){for(var f=0,g=Array(arguments.length-2);f<g.length;)g[f]=arguments[f+2],++f;f=new F(g,0)}return d.call(this,a,b,f)}function d(c,e,f){e=T.c(a,e,f);return b.a?b.a(c,e):b.call(null,c,e)}c.i=2;c.f=function(a){var b=G(a);a=K(a);var c=G(a);a=H(a);return d(b,c,a)};c.d=d;return c}(),f=function(a,b,f){switch(arguments.length){case 0:return e.call(this);case 1:return d.call(this,
a);case 2:return c.call(this,a,b);default:var g=null;if(2<arguments.length){for(var g=0,h=Array(arguments.length-2);g<h.length;)h[g]=arguments[g+2],++g;g=new F(h,0)}return s.d(a,b,g)}throw Error("Invalid arity: "+arguments.length);};f.i=2;f.f=s.f;f.l=e;f.b=d;f.a=c;f.d=s.d;return f}()}}var e=null,f=function(){function a(c,d,e,f,g){var u=null;if(4<arguments.length){for(var u=0,v=Array(arguments.length-4);u<v.length;)v[u]=arguments[u+4],++u;u=new F(v,0)}return b.call(this,c,d,e,f,u)}function b(a,c,d,
f,g){var h=function y(a){return new V(null,function(){var b=e.a(D,a);return Ee(ud,b)?M(e.a(G,b),y(e.a(H,b))):null},null,null)};return e.a(function(){return function(b){return T.a(a,b)}}(h),h(Nc.d(g,f,Kc([d,c],0))))}a.i=4;a.f=function(a){var c=G(a);a=K(a);var d=G(a);a=K(a);var e=G(a);a=K(a);var f=G(a);a=H(a);return b(c,d,e,f,a)};a.d=b;return a}(),e=function(e,h,l,m,p){switch(arguments.length){case 1:return d.call(this,e);case 2:return c.call(this,e,h);case 3:return b.call(this,e,h,l);case 4:return a.call(this,
e,h,l,m);default:var q=null;if(4<arguments.length){for(var q=0,s=Array(arguments.length-4);q<s.length;)s[q]=arguments[q+4],++q;q=new F(s,0)}return f.d(e,h,l,m,q)}throw Error("Invalid arity: "+arguments.length);};e.i=4;e.f=f.f;e.b=d;e.a=c;e.c=b;e.n=a;e.d=f.d;return e}(),Pe=function(){function a(a,b){return new V(null,function(){if(0<a){var f=D(b);return f?M(G(f),c.a(a-1,H(f))):null}return null},null,null)}function b(a){return function(b){return function(a){return function(){function c(d,g){var h=qb(a),
l=a.bb(0,a.Ra(null)-1),h=0<h?b.a?b.a(d,g):b.call(null,d,g):d;return 0<l?h:Ac(h)?h:new yc(h)}function d(a){return b.b?b.b(a):b.call(null,a)}function l(){return b.l?b.l():b.call(null)}var m=null,m=function(a,b){switch(arguments.length){case 0:return l.call(this);case 1:return d.call(this,a);case 2:return c.call(this,a,b)}throw Error("Invalid arity: "+arguments.length);};m.l=l;m.b=d;m.a=c;return m}()}(new Me(a))}}var c=null,c=function(c,e){switch(arguments.length){case 1:return b.call(this,c);case 2:return a.call(this,
c,e)}throw Error("Invalid arity: "+arguments.length);};c.b=b;c.a=a;return c}(),Qe=function(){function a(a,b){return new V(null,function(c){return function(){return c(a,b)}}(function(a,b){for(;;){var c=D(b);if(0<a&&c){var d=a-1,c=H(c);a=d;b=c}else return c}}),null,null)}function b(a){return function(b){return function(a){return function(){function c(d,g){var h=qb(a);a.bb(0,a.Ra(null)-1);return 0<h?d:b.a?b.a(d,g):b.call(null,d,g)}function d(a){return b.b?b.b(a):b.call(null,a)}function l(){return b.l?
b.l():b.call(null)}var m=null,m=function(a,b){switch(arguments.length){case 0:return l.call(this);case 1:return d.call(this,a);case 2:return c.call(this,a,b)}throw Error("Invalid arity: "+arguments.length);};m.l=l;m.b=d;m.a=c;return m}()}(new Me(a))}}var c=null,c=function(c,e){switch(arguments.length){case 1:return b.call(this,c);case 2:return a.call(this,c,e)}throw Error("Invalid arity: "+arguments.length);};c.b=b;c.a=a;return c}(),Re=function(){function a(a,b){return new V(null,function(c){return function(){return c(a,
b)}}(function(a,b){for(;;){var c=D(b),d;if(d=c)d=G(c),d=a.b?a.b(d):a.call(null,d);if(t(d))d=a,c=H(c),a=d,b=c;else return c}}),null,null)}function b(a){return function(b){return function(c){return function(){function g(g,h){var l=qb(c);if(t(t(l)?a.b?a.b(h):a.call(null,h):l))return g;ac(c,null);return b.a?b.a(g,h):b.call(null,g,h)}function h(a){return b.b?b.b(a):b.call(null,a)}function l(){return b.l?b.l():b.call(null)}var m=null,m=function(a,b){switch(arguments.length){case 0:return l.call(this);case 1:return h.call(this,
a);case 2:return g.call(this,a,b)}throw Error("Invalid arity: "+arguments.length);};m.l=l;m.b=h;m.a=g;return m}()}(new Me(!0))}}var c=null,c=function(c,e){switch(arguments.length){case 1:return b.call(this,c);case 2:return a.call(this,c,e)}throw Error("Invalid arity: "+arguments.length);};c.b=b;c.a=a;return c}(),Se=function(){function a(a,b){return Pe.a(a,c.b(b))}function b(a){return new V(null,function(){return M(a,c.b(a))},null,null)}var c=null,c=function(c,e){switch(arguments.length){case 1:return b.call(this,
c);case 2:return a.call(this,c,e)}throw Error("Invalid arity: "+arguments.length);};c.b=b;c.a=a;return c}(),Te=function(){function a(a,b){return Pe.a(a,c.b(b))}function b(a){return new V(null,function(){return M(a.l?a.l():a.call(null),c.b(a))},null,null)}var c=null,c=function(c,e){switch(arguments.length){case 1:return b.call(this,c);case 2:return a.call(this,c,e)}throw Error("Invalid arity: "+arguments.length);};c.b=b;c.a=a;return c}(),Ue=function(){function a(a,c){return new V(null,function(){var f=
D(a),g=D(c);return f&&g?M(G(f),M(G(g),b.a(H(f),H(g)))):null},null,null)}var b=null,c=function(){function a(b,d,h){var l=null;if(2<arguments.length){for(var l=0,m=Array(arguments.length-2);l<m.length;)m[l]=arguments[l+2],++l;l=new F(m,0)}return c.call(this,b,d,l)}function c(a,d,e){return new V(null,function(){var c=Oe.a(D,Nc.d(e,d,Kc([a],0)));return Ee(ud,c)?ae.a(Oe.a(G,c),T.a(b,Oe.a(H,c))):null},null,null)}a.i=2;a.f=function(a){var b=G(a);a=K(a);var d=G(a);a=H(a);return c(b,d,a)};a.d=c;return a}(),
b=function(b,e,f){switch(arguments.length){case 2:return a.call(this,b,e);default:var g=null;if(2<arguments.length){for(var g=0,h=Array(arguments.length-2);g<h.length;)h[g]=arguments[g+2],++g;g=new F(h,0)}return c.d(b,e,g)}throw Error("Invalid arity: "+arguments.length);};b.i=2;b.f=c.f;b.a=a;b.d=c.d;return b}(),We=function(){function a(a){return Ie.a(Oe.b(a),Ve)}var b=null,c=function(){function a(c,d){var h=null;if(1<arguments.length){for(var h=0,l=Array(arguments.length-1);h<l.length;)l[h]=arguments[h+
1],++h;h=new F(l,0)}return b.call(this,c,h)}function b(a,c){return T.a(ae,T.c(Oe,a,c))}a.i=1;a.f=function(a){var c=G(a);a=H(a);return b(c,a)};a.d=b;return a}(),b=function(b,e){switch(arguments.length){case 1:return a.call(this,b);default:var f=null;if(1<arguments.length){for(var f=0,g=Array(arguments.length-1);f<g.length;)g[f]=arguments[f+1],++f;f=new F(g,0)}return c.d(b,f)}throw Error("Invalid arity: "+arguments.length);};b.i=1;b.f=c.f;b.b=a;b.d=c.d;return b}(),Xe=function(){function a(a,b){return new V(null,
function(){var f=D(b);if(f){if(fd(f)){for(var g=Yb(f),h=Q(g),l=Td(h),m=0;;)if(m<h){var p;p=C.a(g,m);p=a.b?a.b(p):a.call(null,p);t(p)&&(p=C.a(g,m),l.add(p));m+=1}else break;return Wd(l.ca(),c.a(a,Zb(f)))}g=G(f);f=H(f);return t(a.b?a.b(g):a.call(null,g))?M(g,c.a(a,f)):c.a(a,f)}return null},null,null)}function b(a){return function(b){return function(){function c(f,g){return t(a.b?a.b(g):a.call(null,g))?b.a?b.a(f,g):b.call(null,f,g):f}function g(a){return b.b?b.b(a):b.call(null,a)}function h(){return b.l?
b.l():b.call(null)}var l=null,l=function(a,b){switch(arguments.length){case 0:return h.call(this);case 1:return g.call(this,a);case 2:return c.call(this,a,b)}throw Error("Invalid arity: "+arguments.length);};l.l=h;l.b=g;l.a=c;return l}()}}var c=null,c=function(c,e){switch(arguments.length){case 1:return b.call(this,c);case 2:return a.call(this,c,e)}throw Error("Invalid arity: "+arguments.length);};c.b=b;c.a=a;return c}(),Ye=function(){function a(a,b){return Xe.a(He(a),b)}function b(a){return Xe.b(He(a))}
var c=null,c=function(c,e){switch(arguments.length){case 1:return b.call(this,c);case 2:return a.call(this,c,e)}throw Error("Invalid arity: "+arguments.length);};c.b=b;c.a=a;return c}();function Ze(a){var b=$e;return function d(a){return new V(null,function(){return M(a,t(b.b?b.b(a):b.call(null,a))?We.d(d,Kc([D.b?D.b(a):D.call(null,a)],0)):null)},null,null)}(a)}
var af=function(){function a(a,b,c){return a&&(a.q&4||a.dc)?O(ce(wd.n(b,de,Ob(a),c)),Vc(a)):wd.n(b,Nc,a,c)}function b(a,b){return null!=a?a&&(a.q&4||a.dc)?O(ce(A.c(Pb,Ob(a),b)),Vc(a)):A.c(Ra,a,b):A.c(Nc,J,b)}var c=null,c=function(c,e,f){switch(arguments.length){case 2:return b.call(this,c,e);case 3:return a.call(this,c,e,f)}throw Error("Invalid arity: "+arguments.length);};c.a=b;c.c=a;return c}(),bf=function(){function a(a,b,c,h){return new V(null,function(){var l=D(h);if(l){var m=Pe.a(a,l);return a===
Q(m)?M(m,d.n(a,b,c,Qe.a(b,l))):Ra(J,Pe.a(a,ae.a(m,c)))}return null},null,null)}function b(a,b,c){return new V(null,function(){var h=D(c);if(h){var l=Pe.a(a,h);return a===Q(l)?M(l,d.c(a,b,Qe.a(b,h))):null}return null},null,null)}function c(a,b){return d.c(a,a,b)}var d=null,d=function(d,f,g,h){switch(arguments.length){case 2:return c.call(this,d,f);case 3:return b.call(this,d,f,g);case 4:return a.call(this,d,f,g,h)}throw Error("Invalid arity: "+arguments.length);};d.a=c;d.c=b;d.n=a;return d}(),cf=function(){function a(a,
b,c){var g=jd;for(b=D(b);;)if(b){var h=a;if(h?h.j&256||h.Rb||(h.j?0:w(Za,h)):w(Za,h)){a=S.c(a,G(b),g);if(g===a)return c;b=K(b)}else return c}else return a}function b(a,b){return c.c(a,b,null)}var c=null,c=function(c,e,f){switch(arguments.length){case 2:return b.call(this,c,e);case 3:return a.call(this,c,e,f)}throw Error("Invalid arity: "+arguments.length);};c.a=b;c.c=a;return c}(),df=function(){function a(a,b,c,d,f,q){var s=R.c(b,0,null);return(b=Ed(b))?Rc.c(a,s,e.P(S.a(a,s),b,c,d,f,q)):Rc.c(a,s,
function(){var b=S.a(a,s);return c.n?c.n(b,d,f,q):c.call(null,b,d,f,q)}())}function b(a,b,c,d,f){var q=R.c(b,0,null);return(b=Ed(b))?Rc.c(a,q,e.r(S.a(a,q),b,c,d,f)):Rc.c(a,q,function(){var b=S.a(a,q);return c.c?c.c(b,d,f):c.call(null,b,d,f)}())}function c(a,b,c,d){var f=R.c(b,0,null);return(b=Ed(b))?Rc.c(a,f,e.n(S.a(a,f),b,c,d)):Rc.c(a,f,function(){var b=S.a(a,f);return c.a?c.a(b,d):c.call(null,b,d)}())}function d(a,b,c){var d=R.c(b,0,null);return(b=Ed(b))?Rc.c(a,d,e.c(S.a(a,d),b,c)):Rc.c(a,d,function(){var b=
S.a(a,d);return c.b?c.b(b):c.call(null,b)}())}var e=null,f=function(){function a(c,d,e,f,g,u,v){var y=null;if(6<arguments.length){for(var y=0,B=Array(arguments.length-6);y<B.length;)B[y]=arguments[y+6],++y;y=new F(B,0)}return b.call(this,c,d,e,f,g,u,y)}function b(a,c,d,f,g,h,v){var y=R.c(c,0,null);return(c=Ed(c))?Rc.c(a,y,T.d(e,S.a(a,y),c,d,f,Kc([g,h,v],0))):Rc.c(a,y,T.d(d,S.a(a,y),f,g,h,Kc([v],0)))}a.i=6;a.f=function(a){var c=G(a);a=K(a);var d=G(a);a=K(a);var e=G(a);a=K(a);var f=G(a);a=K(a);var g=
G(a);a=K(a);var v=G(a);a=H(a);return b(c,d,e,f,g,v,a)};a.d=b;return a}(),e=function(e,h,l,m,p,q,s){switch(arguments.length){case 3:return d.call(this,e,h,l);case 4:return c.call(this,e,h,l,m);case 5:return b.call(this,e,h,l,m,p);case 6:return a.call(this,e,h,l,m,p,q);default:var u=null;if(6<arguments.length){for(var u=0,v=Array(arguments.length-6);u<v.length;)v[u]=arguments[u+6],++u;u=new F(v,0)}return f.d(e,h,l,m,p,q,u)}throw Error("Invalid arity: "+arguments.length);};e.i=6;e.f=f.f;e.c=d;e.n=c;
e.r=b;e.P=a;e.d=f.d;return e}();function ef(a,b){this.u=a;this.e=b}function ff(a){return new ef(a,[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null])}function gf(a){return new ef(a.u,Fa(a.e))}function hf(a){a=a.g;return 32>a?0:a-1>>>5<<5}function jf(a,b,c){for(;;){if(0===b)return c;var d=ff(a);d.e[0]=c;c=d;b-=5}}
var lf=function kf(b,c,d,e){var f=gf(d),g=b.g-1>>>c&31;5===c?f.e[g]=e:(d=d.e[g],b=null!=d?kf(b,c-5,d,e):jf(null,c-5,e),f.e[g]=b);return f};function mf(a,b){throw Error([z("No item "),z(a),z(" in vector of length "),z(b)].join(""));}function nf(a,b){if(b>=hf(a))return a.W;for(var c=a.root,d=a.shift;;)if(0<d)var e=d-5,c=c.e[b>>>d&31],d=e;else return c.e}function of(a,b){return 0<=b&&b<a.g?nf(a,b):mf(b,a.g)}
var qf=function pf(b,c,d,e,f){var g=gf(d);if(0===c)g.e[e&31]=f;else{var h=e>>>c&31;b=pf(b,c-5,d.e[h],e,f);g.e[h]=b}return g},sf=function rf(b,c,d){var e=b.g-2>>>c&31;if(5<c){b=rf(b,c-5,d.e[e]);if(null==b&&0===e)return null;d=gf(d);d.e[e]=b;return d}if(0===e)return null;d=gf(d);d.e[e]=null;return d};function tf(a,b,c,d,e,f){this.m=a;this.zb=b;this.e=c;this.oa=d;this.start=e;this.end=f}tf.prototype.ga=function(){return this.m<this.end};
tf.prototype.next=function(){32===this.m-this.zb&&(this.e=nf(this.oa,this.m),this.zb+=32);var a=this.e[this.m&31];this.m+=1;return a};function W(a,b,c,d,e,f){this.k=a;this.g=b;this.shift=c;this.root=d;this.W=e;this.p=f;this.j=167668511;this.q=8196}k=W.prototype;k.toString=function(){return ec(this)};k.t=function(a,b){return $a.c(this,b,null)};k.s=function(a,b,c){return"number"===typeof b?C.c(this,b,c):c};
k.gb=function(a,b,c){a=0;for(var d=c;;)if(a<this.g){var e=nf(this,a);c=e.length;a:{for(var f=0;;)if(f<c){var g=f+a,h=e[f],d=b.c?b.c(d,g,h):b.call(null,d,g,h);if(Ac(d)){e=d;break a}f+=1}else{e=d;break a}e=void 0}if(Ac(e))return b=e,L.b?L.b(b):L.call(null,b);a+=c;d=e}else return d};k.Q=function(a,b){return of(this,b)[b&31]};k.$=function(a,b,c){return 0<=b&&b<this.g?nf(this,b)[b&31]:c};
k.Ua=function(a,b,c){if(0<=b&&b<this.g)return hf(this)<=b?(a=Fa(this.W),a[b&31]=c,new W(this.k,this.g,this.shift,this.root,a,null)):new W(this.k,this.g,this.shift,qf(this,this.shift,this.root,b,c),this.W,null);if(b===this.g)return Ra(this,c);throw Error([z("Index "),z(b),z(" out of bounds  [0,"),z(this.g),z("]")].join(""));};k.vb=!0;k.fb=function(){var a=this.g;return new tf(0,0,0<Q(this)?nf(this,0):null,this,0,a)};k.H=function(){return this.k};k.L=function(){return this.g};
k.hb=function(){return C.a(this,0)};k.ib=function(){return C.a(this,1)};k.La=function(){return 0<this.g?C.a(this,this.g-1):null};
k.Ma=function(){if(0===this.g)throw Error("Can't pop empty vector");if(1===this.g)return ub(Mc,this.k);if(1<this.g-hf(this))return new W(this.k,this.g-1,this.shift,this.root,this.W.slice(0,-1),null);var a=nf(this,this.g-2),b=sf(this,this.shift,this.root),b=null==b?uf:b,c=this.g-1;return 5<this.shift&&null==b.e[1]?new W(this.k,c,this.shift-5,b.e[0],a,null):new W(this.k,c,this.shift,b,a,null)};k.ab=function(){return 0<this.g?new Hc(this,this.g-1,null):null};
k.B=function(){var a=this.p;return null!=a?a:this.p=a=wc(this)};k.A=function(a,b){if(b instanceof W)if(this.g===Q(b))for(var c=cc(this),d=cc(b);;)if(t(c.ga())){var e=c.next(),f=d.next();if(!sc.a(e,f))return!1}else return!0;else return!1;else return Ic(this,b)};k.$a=function(){var a=this;return new vf(a.g,a.shift,function(){var b=a.root;return wf.b?wf.b(b):wf.call(null,b)}(),function(){var b=a.W;return xf.b?xf.b(b):xf.call(null,b)}())};k.J=function(){return O(Mc,this.k)};
k.R=function(a,b){return Cc.a(this,b)};k.O=function(a,b,c){a=0;for(var d=c;;)if(a<this.g){var e=nf(this,a);c=e.length;a:{for(var f=0;;)if(f<c){var g=e[f],d=b.a?b.a(d,g):b.call(null,d,g);if(Ac(d)){e=d;break a}f+=1}else{e=d;break a}e=void 0}if(Ac(e))return b=e,L.b?L.b(b):L.call(null,b);a+=c;d=e}else return d};k.Ka=function(a,b,c){if("number"===typeof b)return pb(this,b,c);throw Error("Vector's key for assoc must be a number.");};
k.D=function(){if(0===this.g)return null;if(32>=this.g)return new F(this.W,0);var a;a:{a=this.root;for(var b=this.shift;;)if(0<b)b-=5,a=a.e[0];else{a=a.e;break a}a=void 0}return yf.n?yf.n(this,a,0,0):yf.call(null,this,a,0,0)};k.F=function(a,b){return new W(b,this.g,this.shift,this.root,this.W,this.p)};
k.G=function(a,b){if(32>this.g-hf(this)){for(var c=this.W.length,d=Array(c+1),e=0;;)if(e<c)d[e]=this.W[e],e+=1;else break;d[c]=b;return new W(this.k,this.g+1,this.shift,this.root,d,null)}c=(d=this.g>>>5>1<<this.shift)?this.shift+5:this.shift;d?(d=ff(null),d.e[0]=this.root,e=jf(null,this.shift,new ef(null,this.W)),d.e[1]=e):d=lf(this,this.shift,this.root,new ef(null,this.W));return new W(this.k,this.g+1,c,d,[b],null)};
k.call=function(){var a=null,a=function(a,c,d){switch(arguments.length){case 2:return this.Q(null,c);case 3:return this.$(null,c,d)}throw Error("Invalid arity: "+arguments.length);};a.a=function(a,c){return this.Q(null,c)};a.c=function(a,c,d){return this.$(null,c,d)};return a}();k.apply=function(a,b){return this.call.apply(this,[this].concat(Fa(b)))};k.b=function(a){return this.Q(null,a)};k.a=function(a,b){return this.$(null,a,b)};
var uf=new ef(null,[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]),Mc=new W(null,0,5,uf,[],0);W.prototype[Ea]=function(){return uc(this)};function zf(a){return Qb(A.c(Pb,Ob(Mc),a))}
var Af=function(){function a(a){var d=null;if(0<arguments.length){for(var d=0,e=Array(arguments.length-0);d<e.length;)e[d]=arguments[d+0],++d;d=new F(e,0)}return b.call(this,d)}function b(a){if(a instanceof F&&0===a.m)a:{a=a.e;var b=a.length;if(32>b)a=new W(null,b,5,uf,a,null);else{for(var e=32,f=(new W(null,32,5,uf,a.slice(0,32),null)).$a(null);;)if(e<b)var g=e+1,f=de.a(f,a[e]),e=g;else{a=Qb(f);break a}a=void 0}}else a=zf(a);return a}a.i=0;a.f=function(a){a=D(a);return b(a)};a.d=b;return a}();
function Bf(a,b,c,d,e,f){this.ha=a;this.Ja=b;this.m=c;this.V=d;this.k=e;this.p=f;this.j=32375020;this.q=1536}k=Bf.prototype;k.toString=function(){return ec(this)};k.H=function(){return this.k};k.T=function(){if(this.V+1<this.Ja.length){var a;a=this.ha;var b=this.Ja,c=this.m,d=this.V+1;a=yf.n?yf.n(a,b,c,d):yf.call(null,a,b,c,d);return null==a?null:a}return $b(this)};k.B=function(){var a=this.p;return null!=a?a:this.p=a=wc(this)};k.A=function(a,b){return Ic(this,b)};k.J=function(){return O(Mc,this.k)};
k.R=function(a,b){var c=this;return Cc.a(function(){var a=c.ha,b=c.m+c.V,f=Q(c.ha);return Cf.c?Cf.c(a,b,f):Cf.call(null,a,b,f)}(),b)};k.O=function(a,b,c){var d=this;return Cc.c(function(){var a=d.ha,b=d.m+d.V,c=Q(d.ha);return Cf.c?Cf.c(a,b,c):Cf.call(null,a,b,c)}(),b,c)};k.N=function(){return this.Ja[this.V]};k.S=function(){if(this.V+1<this.Ja.length){var a;a=this.ha;var b=this.Ja,c=this.m,d=this.V+1;a=yf.n?yf.n(a,b,c,d):yf.call(null,a,b,c,d);return null==a?J:a}return Zb(this)};k.D=function(){return this};
k.Cb=function(){return Ud.a(this.Ja,this.V)};k.Db=function(){var a=this.m+this.Ja.length;if(a<Ma(this.ha)){var b=this.ha,c=nf(this.ha,a);return yf.n?yf.n(b,c,a,0):yf.call(null,b,c,a,0)}return J};k.F=function(a,b){var c=this.ha,d=this.Ja,e=this.m,f=this.V;return yf.r?yf.r(c,d,e,f,b):yf.call(null,c,d,e,f,b)};k.G=function(a,b){return M(b,this)};k.Bb=function(){var a=this.m+this.Ja.length;if(a<Ma(this.ha)){var b=this.ha,c=nf(this.ha,a);return yf.n?yf.n(b,c,a,0):yf.call(null,b,c,a,0)}return null};
Bf.prototype[Ea]=function(){return uc(this)};var yf=function(){function a(a,b,c,d,l){return new Bf(a,b,c,d,l,null)}function b(a,b,c,d){return new Bf(a,b,c,d,null,null)}function c(a,b,c){return new Bf(a,of(a,b),b,c,null,null)}var d=null,d=function(d,f,g,h,l){switch(arguments.length){case 3:return c.call(this,d,f,g);case 4:return b.call(this,d,f,g,h);case 5:return a.call(this,d,f,g,h,l)}throw Error("Invalid arity: "+arguments.length);};d.c=c;d.n=b;d.r=a;return d}();
function Df(a,b,c,d,e){this.k=a;this.oa=b;this.start=c;this.end=d;this.p=e;this.j=166617887;this.q=8192}k=Df.prototype;k.toString=function(){return ec(this)};k.t=function(a,b){return $a.c(this,b,null)};k.s=function(a,b,c){return"number"===typeof b?C.c(this,b,c):c};k.Q=function(a,b){return 0>b||this.end<=this.start+b?mf(b,this.end-this.start):C.a(this.oa,this.start+b)};k.$=function(a,b,c){return 0>b||this.end<=this.start+b?c:C.c(this.oa,this.start+b,c)};
k.Ua=function(a,b,c){var d=this.start+b;a=this.k;c=Rc.c(this.oa,d,c);b=this.start;var e=this.end,d=d+1,d=e>d?e:d;return Ef.r?Ef.r(a,c,b,d,null):Ef.call(null,a,c,b,d,null)};k.H=function(){return this.k};k.L=function(){return this.end-this.start};k.La=function(){return C.a(this.oa,this.end-1)};k.Ma=function(){if(this.start===this.end)throw Error("Can't pop empty vector");var a=this.k,b=this.oa,c=this.start,d=this.end-1;return Ef.r?Ef.r(a,b,c,d,null):Ef.call(null,a,b,c,d,null)};
k.ab=function(){return this.start!==this.end?new Hc(this,this.end-this.start-1,null):null};k.B=function(){var a=this.p;return null!=a?a:this.p=a=wc(this)};k.A=function(a,b){return Ic(this,b)};k.J=function(){return O(Mc,this.k)};k.R=function(a,b){return Cc.a(this,b)};k.O=function(a,b,c){return Cc.c(this,b,c)};k.Ka=function(a,b,c){if("number"===typeof b)return pb(this,b,c);throw Error("Subvec's key for assoc must be a number.");};
k.D=function(){var a=this;return function(b){return function d(e){return e===a.end?null:M(C.a(a.oa,e),new V(null,function(){return function(){return d(e+1)}}(b),null,null))}}(this)(a.start)};k.F=function(a,b){var c=this.oa,d=this.start,e=this.end,f=this.p;return Ef.r?Ef.r(b,c,d,e,f):Ef.call(null,b,c,d,e,f)};k.G=function(a,b){var c=this.k,d=pb(this.oa,this.end,b),e=this.start,f=this.end+1;return Ef.r?Ef.r(c,d,e,f,null):Ef.call(null,c,d,e,f,null)};
k.call=function(){var a=null,a=function(a,c,d){switch(arguments.length){case 2:return this.Q(null,c);case 3:return this.$(null,c,d)}throw Error("Invalid arity: "+arguments.length);};a.a=function(a,c){return this.Q(null,c)};a.c=function(a,c,d){return this.$(null,c,d)};return a}();k.apply=function(a,b){return this.call.apply(this,[this].concat(Fa(b)))};k.b=function(a){return this.Q(null,a)};k.a=function(a,b){return this.$(null,a,b)};Df.prototype[Ea]=function(){return uc(this)};
function Ef(a,b,c,d,e){for(;;)if(b instanceof Df)c=b.start+c,d=b.start+d,b=b.oa;else{var f=Q(b);if(0>c||0>d||c>f||d>f)throw Error("Index out of bounds");return new Df(a,b,c,d,e)}}var Cf=function(){function a(a,b,c){return Ef(null,a,b,c,null)}function b(a,b){return c.c(a,b,Q(a))}var c=null,c=function(c,e,f){switch(arguments.length){case 2:return b.call(this,c,e);case 3:return a.call(this,c,e,f)}throw Error("Invalid arity: "+arguments.length);};c.a=b;c.c=a;return c}();
function Ff(a,b){return a===b.u?b:new ef(a,Fa(b.e))}function wf(a){return new ef({},Fa(a.e))}function xf(a){var b=[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null];hd(a,0,b,0,a.length);return b}
var Hf=function Gf(b,c,d,e){d=Ff(b.root.u,d);var f=b.g-1>>>c&31;if(5===c)b=e;else{var g=d.e[f];b=null!=g?Gf(b,c-5,g,e):jf(b.root.u,c-5,e)}d.e[f]=b;return d},Jf=function If(b,c,d){d=Ff(b.root.u,d);var e=b.g-2>>>c&31;if(5<c){b=If(b,c-5,d.e[e]);if(null==b&&0===e)return null;d.e[e]=b;return d}if(0===e)return null;d.e[e]=null;return d};function vf(a,b,c,d){this.g=a;this.shift=b;this.root=c;this.W=d;this.j=275;this.q=88}k=vf.prototype;
k.call=function(){var a=null,a=function(a,c,d){switch(arguments.length){case 2:return this.t(null,c);case 3:return this.s(null,c,d)}throw Error("Invalid arity: "+arguments.length);};a.a=function(a,c){return this.t(null,c)};a.c=function(a,c,d){return this.s(null,c,d)};return a}();k.apply=function(a,b){return this.call.apply(this,[this].concat(Fa(b)))};k.b=function(a){return this.t(null,a)};k.a=function(a,b){return this.s(null,a,b)};k.t=function(a,b){return $a.c(this,b,null)};
k.s=function(a,b,c){return"number"===typeof b?C.c(this,b,c):c};k.Q=function(a,b){if(this.root.u)return of(this,b)[b&31];throw Error("nth after persistent!");};k.$=function(a,b,c){return 0<=b&&b<this.g?C.a(this,b):c};k.L=function(){if(this.root.u)return this.g;throw Error("count after persistent!");};
k.Ub=function(a,b,c){var d=this;if(d.root.u){if(0<=b&&b<d.g)return hf(this)<=b?d.W[b&31]=c:(a=function(){return function f(a,h){var l=Ff(d.root.u,h);if(0===a)l.e[b&31]=c;else{var m=b>>>a&31,p=f(a-5,l.e[m]);l.e[m]=p}return l}}(this).call(null,d.shift,d.root),d.root=a),this;if(b===d.g)return Pb(this,c);throw Error([z("Index "),z(b),z(" out of bounds for TransientVector of length"),z(d.g)].join(""));}throw Error("assoc! after persistent!");};
k.Vb=function(){if(this.root.u){if(0===this.g)throw Error("Can't pop empty vector");if(1===this.g)this.g=0;else if(0<(this.g-1&31))this.g-=1;else{var a;a:if(a=this.g-2,a>=hf(this))a=this.W;else{for(var b=this.root,c=b,d=this.shift;;)if(0<d)c=Ff(b.u,c.e[a>>>d&31]),d-=5;else{a=c.e;break a}a=void 0}b=Jf(this,this.shift,this.root);b=null!=b?b:new ef(this.root.u,[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,
null,null,null,null]);5<this.shift&&null==b.e[1]?(this.root=Ff(this.root.u,b.e[0]),this.shift-=5):this.root=b;this.g-=1;this.W=a}return this}throw Error("pop! after persistent!");};k.kb=function(a,b,c){if("number"===typeof b)return Tb(this,b,c);throw Error("TransientVector's key for assoc! must be a number.");};
k.Sa=function(a,b){if(this.root.u){if(32>this.g-hf(this))this.W[this.g&31]=b;else{var c=new ef(this.root.u,this.W),d=[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null];d[0]=b;this.W=d;if(this.g>>>5>1<<this.shift){var d=[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],e=this.shift+
5;d[0]=this.root;d[1]=jf(this.root.u,this.shift,c);this.root=new ef(this.root.u,d);this.shift=e}else this.root=Hf(this,this.shift,this.root,c)}this.g+=1;return this}throw Error("conj! after persistent!");};k.Ta=function(){if(this.root.u){this.root.u=null;var a=this.g-hf(this),b=Array(a);hd(this.W,0,b,0,a);return new W(null,this.g,this.shift,this.root,b,null)}throw Error("persistent! called twice");};function Kf(a,b,c,d){this.k=a;this.ea=b;this.sa=c;this.p=d;this.q=0;this.j=31850572}k=Kf.prototype;
k.toString=function(){return ec(this)};k.H=function(){return this.k};k.B=function(){var a=this.p;return null!=a?a:this.p=a=wc(this)};k.A=function(a,b){return Ic(this,b)};k.J=function(){return O(J,this.k)};k.N=function(){return G(this.ea)};k.S=function(){var a=K(this.ea);return a?new Kf(this.k,a,this.sa,null):null==this.sa?Na(this):new Kf(this.k,this.sa,null,null)};k.D=function(){return this};k.F=function(a,b){return new Kf(b,this.ea,this.sa,this.p)};k.G=function(a,b){return M(b,this)};
Kf.prototype[Ea]=function(){return uc(this)};function Lf(a,b,c,d,e){this.k=a;this.count=b;this.ea=c;this.sa=d;this.p=e;this.j=31858766;this.q=8192}k=Lf.prototype;k.toString=function(){return ec(this)};k.H=function(){return this.k};k.L=function(){return this.count};k.La=function(){return G(this.ea)};k.Ma=function(){if(t(this.ea)){var a=K(this.ea);return a?new Lf(this.k,this.count-1,a,this.sa,null):new Lf(this.k,this.count-1,D(this.sa),Mc,null)}return this};
k.B=function(){var a=this.p;return null!=a?a:this.p=a=wc(this)};k.A=function(a,b){return Ic(this,b)};k.J=function(){return O(Mf,this.k)};k.N=function(){return G(this.ea)};k.S=function(){return H(D(this))};k.D=function(){var a=D(this.sa),b=this.ea;return t(t(b)?b:a)?new Kf(null,this.ea,D(a),null):null};k.F=function(a,b){return new Lf(b,this.count,this.ea,this.sa,this.p)};
k.G=function(a,b){var c;t(this.ea)?(c=this.sa,c=new Lf(this.k,this.count+1,this.ea,Nc.a(t(c)?c:Mc,b),null)):c=new Lf(this.k,this.count+1,Nc.a(this.ea,b),Mc,null);return c};var Mf=new Lf(null,0,null,Mc,0);Lf.prototype[Ea]=function(){return uc(this)};function Nf(){this.q=0;this.j=2097152}Nf.prototype.A=function(){return!1};var Of=new Nf;function Pf(a,b){return md(dd(b)?Q(a)===Q(b)?Ee(ud,Oe.a(function(a){return sc.a(S.c(b,G(a),Of),Lc(a))},a)):null:null)}
function Qf(a,b){var c=a.e;if(b instanceof U)a:{for(var d=c.length,e=b.pa,f=0;;){if(d<=f){c=-1;break a}var g=c[f];if(g instanceof U&&e===g.pa){c=f;break a}f+=2}c=void 0}else if(d="string"==typeof b,t(t(d)?d:"number"===typeof b))a:{d=c.length;for(e=0;;){if(d<=e){c=-1;break a}if(b===c[e]){c=e;break a}e+=2}c=void 0}else if(b instanceof qc)a:{d=c.length;e=b.ta;for(f=0;;){if(d<=f){c=-1;break a}g=c[f];if(g instanceof qc&&e===g.ta){c=f;break a}f+=2}c=void 0}else if(null==b)a:{d=c.length;for(e=0;;){if(d<=
e){c=-1;break a}if(null==c[e]){c=e;break a}e+=2}c=void 0}else a:{d=c.length;for(e=0;;){if(d<=e){c=-1;break a}if(sc.a(b,c[e])){c=e;break a}e+=2}c=void 0}return c}function Rf(a,b,c){this.e=a;this.m=b;this.Z=c;this.q=0;this.j=32374990}k=Rf.prototype;k.toString=function(){return ec(this)};k.H=function(){return this.Z};k.T=function(){return this.m<this.e.length-2?new Rf(this.e,this.m+2,this.Z):null};k.L=function(){return(this.e.length-this.m)/2};k.B=function(){return wc(this)};
k.A=function(a,b){return Ic(this,b)};k.J=function(){return O(J,this.Z)};k.R=function(a,b){return P.a(b,this)};k.O=function(a,b,c){return P.c(b,c,this)};k.N=function(){return new W(null,2,5,uf,[this.e[this.m],this.e[this.m+1]],null)};k.S=function(){return this.m<this.e.length-2?new Rf(this.e,this.m+2,this.Z):J};k.D=function(){return this};k.F=function(a,b){return new Rf(this.e,this.m,b)};k.G=function(a,b){return M(b,this)};Rf.prototype[Ea]=function(){return uc(this)};
function Sf(a,b,c){this.e=a;this.m=b;this.g=c}Sf.prototype.ga=function(){return this.m<this.g};Sf.prototype.next=function(){var a=new W(null,2,5,uf,[this.e[this.m],this.e[this.m+1]],null);this.m+=2;return a};function pa(a,b,c,d){this.k=a;this.g=b;this.e=c;this.p=d;this.j=16647951;this.q=8196}k=pa.prototype;k.toString=function(){return ec(this)};k.t=function(a,b){return $a.c(this,b,null)};k.s=function(a,b,c){a=Qf(this,b);return-1===a?c:this.e[a+1]};
k.gb=function(a,b,c){a=this.e.length;for(var d=0;;)if(d<a){var e=this.e[d],f=this.e[d+1];c=b.c?b.c(c,e,f):b.call(null,c,e,f);if(Ac(c))return b=c,L.b?L.b(b):L.call(null,b);d+=2}else return c};k.vb=!0;k.fb=function(){return new Sf(this.e,0,2*this.g)};k.H=function(){return this.k};k.L=function(){return this.g};k.B=function(){var a=this.p;return null!=a?a:this.p=a=xc(this)};
k.A=function(a,b){if(b&&(b.j&1024||b.ic)){var c=this.e.length;if(this.g===b.L(null))for(var d=0;;)if(d<c){var e=b.s(null,this.e[d],jd);if(e!==jd)if(sc.a(this.e[d+1],e))d+=2;else return!1;else return!1}else return!0;else return!1}else return Pf(this,b)};k.$a=function(){return new Tf({},this.e.length,Fa(this.e))};k.J=function(){return ub(Uf,this.k)};k.R=function(a,b){return P.a(b,this)};k.O=function(a,b,c){return P.c(b,c,this)};
k.wb=function(a,b){if(0<=Qf(this,b)){var c=this.e.length,d=c-2;if(0===d)return Na(this);for(var d=Array(d),e=0,f=0;;){if(e>=c)return new pa(this.k,this.g-1,d,null);sc.a(b,this.e[e])||(d[f]=this.e[e],d[f+1]=this.e[e+1],f+=2);e+=2}}else return this};
k.Ka=function(a,b,c){a=Qf(this,b);if(-1===a){if(this.g<Vf){a=this.e;for(var d=a.length,e=Array(d+2),f=0;;)if(f<d)e[f]=a[f],f+=1;else break;e[d]=b;e[d+1]=c;return new pa(this.k,this.g+1,e,null)}return ub(cb(af.a(Qc,this),b,c),this.k)}if(c===this.e[a+1])return this;b=Fa(this.e);b[a+1]=c;return new pa(this.k,this.g,b,null)};k.rb=function(a,b){return-1!==Qf(this,b)};k.D=function(){var a=this.e;return 0<=a.length-2?new Rf(a,0,null):null};k.F=function(a,b){return new pa(b,this.g,this.e,this.p)};
k.G=function(a,b){if(ed(b))return cb(this,C.a(b,0),C.a(b,1));for(var c=this,d=D(b);;){if(null==d)return c;var e=G(d);if(ed(e))c=cb(c,C.a(e,0),C.a(e,1)),d=K(d);else throw Error("conj on a map takes map entries or seqables of map entries");}};
k.call=function(){var a=null,a=function(a,c,d){switch(arguments.length){case 2:return this.t(null,c);case 3:return this.s(null,c,d)}throw Error("Invalid arity: "+arguments.length);};a.a=function(a,c){return this.t(null,c)};a.c=function(a,c,d){return this.s(null,c,d)};return a}();k.apply=function(a,b){return this.call.apply(this,[this].concat(Fa(b)))};k.b=function(a){return this.t(null,a)};k.a=function(a,b){return this.s(null,a,b)};var Uf=new pa(null,0,[],null),Vf=8;pa.prototype[Ea]=function(){return uc(this)};
function Tf(a,b,c){this.Va=a;this.qa=b;this.e=c;this.q=56;this.j=258}k=Tf.prototype;k.Jb=function(a,b){if(t(this.Va)){var c=Qf(this,b);0<=c&&(this.e[c]=this.e[this.qa-2],this.e[c+1]=this.e[this.qa-1],c=this.e,c.pop(),c.pop(),this.qa-=2);return this}throw Error("dissoc! after persistent!");};
k.kb=function(a,b,c){var d=this;if(t(d.Va)){a=Qf(this,b);if(-1===a)return d.qa+2<=2*Vf?(d.qa+=2,d.e.push(b),d.e.push(c),this):ee.c(function(){var a=d.qa,b=d.e;return Xf.a?Xf.a(a,b):Xf.call(null,a,b)}(),b,c);c!==d.e[a+1]&&(d.e[a+1]=c);return this}throw Error("assoc! after persistent!");};
k.Sa=function(a,b){if(t(this.Va)){if(b?b.j&2048||b.jc||(b.j?0:w(fb,b)):w(fb,b))return Rb(this,Yf.b?Yf.b(b):Yf.call(null,b),Zf.b?Zf.b(b):Zf.call(null,b));for(var c=D(b),d=this;;){var e=G(c);if(t(e))var f=e,c=K(c),d=Rb(d,function(){var a=f;return Yf.b?Yf.b(a):Yf.call(null,a)}(),function(){var a=f;return Zf.b?Zf.b(a):Zf.call(null,a)}());else return d}}else throw Error("conj! after persistent!");};
k.Ta=function(){if(t(this.Va))return this.Va=!1,new pa(null,Cd(this.qa,2),this.e,null);throw Error("persistent! called twice");};k.t=function(a,b){return $a.c(this,b,null)};k.s=function(a,b,c){if(t(this.Va))return a=Qf(this,b),-1===a?c:this.e[a+1];throw Error("lookup after persistent!");};k.L=function(){if(t(this.Va))return Cd(this.qa,2);throw Error("count after persistent!");};function Xf(a,b){for(var c=Ob(Qc),d=0;;)if(d<a)c=ee.c(c,b[d],b[d+1]),d+=2;else return c}function $f(){this.o=!1}
function ag(a,b){return a===b?!0:Nd(a,b)?!0:sc.a(a,b)}var bg=function(){function a(a,b,c,g,h){a=Fa(a);a[b]=c;a[g]=h;return a}function b(a,b,c){a=Fa(a);a[b]=c;return a}var c=null,c=function(c,e,f,g,h){switch(arguments.length){case 3:return b.call(this,c,e,f);case 5:return a.call(this,c,e,f,g,h)}throw Error("Invalid arity: "+arguments.length);};c.c=b;c.r=a;return c}();function cg(a,b){var c=Array(a.length-2);hd(a,0,c,0,2*b);hd(a,2*(b+1),c,2*b,c.length-2*b);return c}
var dg=function(){function a(a,b,c,g,h,l){a=a.Na(b);a.e[c]=g;a.e[h]=l;return a}function b(a,b,c,g){a=a.Na(b);a.e[c]=g;return a}var c=null,c=function(c,e,f,g,h,l){switch(arguments.length){case 4:return b.call(this,c,e,f,g);case 6:return a.call(this,c,e,f,g,h,l)}throw Error("Invalid arity: "+arguments.length);};c.n=b;c.P=a;return c}();
function eg(a,b,c){for(var d=a.length,e=0,f=c;;)if(e<d){c=a[e];if(null!=c){var g=a[e+1];c=b.c?b.c(f,c,g):b.call(null,f,c,g)}else c=a[e+1],c=null!=c?c.Xa(b,f):f;if(Ac(c))return a=c,L.b?L.b(a):L.call(null,a);e+=2;f=c}else return f}function fg(a,b,c){this.u=a;this.w=b;this.e=c}k=fg.prototype;k.Na=function(a){if(a===this.u)return this;var b=Dd(this.w),c=Array(0>b?4:2*(b+1));hd(this.e,0,c,0,2*b);return new fg(a,this.w,c)};
k.nb=function(a,b,c,d,e){var f=1<<(c>>>b&31);if(0===(this.w&f))return this;var g=Dd(this.w&f-1),h=this.e[2*g],l=this.e[2*g+1];return null==h?(b=l.nb(a,b+5,c,d,e),b===l?this:null!=b?dg.n(this,a,2*g+1,b):this.w===f?null:gg(this,a,f,g)):ag(d,h)?(e[0]=!0,gg(this,a,f,g)):this};function gg(a,b,c,d){if(a.w===c)return null;a=a.Na(b);b=a.e;var e=b.length;a.w^=c;hd(b,2*(d+1),b,2*d,e-2*(d+1));b[e-2]=null;b[e-1]=null;return a}k.lb=function(){var a=this.e;return hg.b?hg.b(a):hg.call(null,a)};
k.Xa=function(a,b){return eg(this.e,a,b)};k.Oa=function(a,b,c,d){var e=1<<(b>>>a&31);if(0===(this.w&e))return d;var f=Dd(this.w&e-1),e=this.e[2*f],f=this.e[2*f+1];return null==e?f.Oa(a+5,b,c,d):ag(c,e)?f:d};
k.la=function(a,b,c,d,e,f){var g=1<<(c>>>b&31),h=Dd(this.w&g-1);if(0===(this.w&g)){var l=Dd(this.w);if(2*l<this.e.length){var m=this.Na(a),p=m.e;f.o=!0;id(p,2*h,p,2*(h+1),2*(l-h));p[2*h]=d;p[2*h+1]=e;m.w|=g;return m}if(16<=l){g=[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null];g[c>>>b&31]=ig.la(a,b+5,c,d,e,f);for(m=h=0;;)if(32>h)0!==(this.w>>>h&1)&&(g[h]=null!=this.e[m]?ig.la(a,b+5,nc(this.e[m]),
this.e[m],this.e[m+1],f):this.e[m+1],m+=2),h+=1;else break;return new jg(a,l+1,g)}p=Array(2*(l+4));hd(this.e,0,p,0,2*h);p[2*h]=d;p[2*h+1]=e;hd(this.e,2*h,p,2*(h+1),2*(l-h));f.o=!0;m=this.Na(a);m.e=p;m.w|=g;return m}var q=this.e[2*h],s=this.e[2*h+1];if(null==q)return l=s.la(a,b+5,c,d,e,f),l===s?this:dg.n(this,a,2*h+1,l);if(ag(d,q))return e===s?this:dg.n(this,a,2*h+1,e);f.o=!0;return dg.P(this,a,2*h,null,2*h+1,function(){var f=b+5;return kg.ia?kg.ia(a,f,q,s,c,d,e):kg.call(null,a,f,q,s,c,d,e)}())};
k.ka=function(a,b,c,d,e){var f=1<<(b>>>a&31),g=Dd(this.w&f-1);if(0===(this.w&f)){var h=Dd(this.w);if(16<=h){f=[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null];f[b>>>a&31]=ig.ka(a+5,b,c,d,e);for(var l=g=0;;)if(32>g)0!==(this.w>>>g&1)&&(f[g]=null!=this.e[l]?ig.ka(a+5,nc(this.e[l]),this.e[l],this.e[l+1],e):this.e[l+1],l+=2),g+=1;else break;return new jg(null,h+1,f)}l=Array(2*(h+1));hd(this.e,
0,l,0,2*g);l[2*g]=c;l[2*g+1]=d;hd(this.e,2*g,l,2*(g+1),2*(h-g));e.o=!0;return new fg(null,this.w|f,l)}var m=this.e[2*g],p=this.e[2*g+1];if(null==m)return h=p.ka(a+5,b,c,d,e),h===p?this:new fg(null,this.w,bg.c(this.e,2*g+1,h));if(ag(c,m))return d===p?this:new fg(null,this.w,bg.c(this.e,2*g+1,d));e.o=!0;return new fg(null,this.w,bg.r(this.e,2*g,null,2*g+1,function(){var e=a+5;return kg.P?kg.P(e,m,p,b,c,d):kg.call(null,e,m,p,b,c,d)}()))};
k.mb=function(a,b,c){var d=1<<(b>>>a&31);if(0===(this.w&d))return this;var e=Dd(this.w&d-1),f=this.e[2*e],g=this.e[2*e+1];return null==f?(a=g.mb(a+5,b,c),a===g?this:null!=a?new fg(null,this.w,bg.c(this.e,2*e+1,a)):this.w===d?null:new fg(null,this.w^d,cg(this.e,e))):ag(c,f)?new fg(null,this.w^d,cg(this.e,e)):this};var ig=new fg(null,0,[]);
function lg(a,b,c){var d=a.e,e=d.length;a=Array(2*(a.g-1));for(var f=0,g=1,h=0;;)if(f<e)f!==c&&null!=d[f]&&(a[g]=d[f],g+=2,h|=1<<f),f+=1;else return new fg(b,h,a)}function jg(a,b,c){this.u=a;this.g=b;this.e=c}k=jg.prototype;k.Na=function(a){return a===this.u?this:new jg(a,this.g,Fa(this.e))};
k.nb=function(a,b,c,d,e){var f=c>>>b&31,g=this.e[f];if(null==g)return this;b=g.nb(a,b+5,c,d,e);if(b===g)return this;if(null==b){if(8>=this.g)return lg(this,a,f);a=dg.n(this,a,f,b);a.g-=1;return a}return dg.n(this,a,f,b)};k.lb=function(){var a=this.e;return mg.b?mg.b(a):mg.call(null,a)};k.Xa=function(a,b){for(var c=this.e.length,d=0,e=b;;)if(d<c){var f=this.e[d];if(null!=f&&(e=f.Xa(a,e),Ac(e)))return c=e,L.b?L.b(c):L.call(null,c);d+=1}else return e};
k.Oa=function(a,b,c,d){var e=this.e[b>>>a&31];return null!=e?e.Oa(a+5,b,c,d):d};k.la=function(a,b,c,d,e,f){var g=c>>>b&31,h=this.e[g];if(null==h)return a=dg.n(this,a,g,ig.la(a,b+5,c,d,e,f)),a.g+=1,a;b=h.la(a,b+5,c,d,e,f);return b===h?this:dg.n(this,a,g,b)};k.ka=function(a,b,c,d,e){var f=b>>>a&31,g=this.e[f];if(null==g)return new jg(null,this.g+1,bg.c(this.e,f,ig.ka(a+5,b,c,d,e)));a=g.ka(a+5,b,c,d,e);return a===g?this:new jg(null,this.g,bg.c(this.e,f,a))};
k.mb=function(a,b,c){var d=b>>>a&31,e=this.e[d];return null!=e?(a=e.mb(a+5,b,c),a===e?this:null==a?8>=this.g?lg(this,null,d):new jg(null,this.g-1,bg.c(this.e,d,a)):new jg(null,this.g,bg.c(this.e,d,a))):this};function ng(a,b,c){b*=2;for(var d=0;;)if(d<b){if(ag(c,a[d]))return d;d+=2}else return-1}function og(a,b,c,d){this.u=a;this.Ia=b;this.g=c;this.e=d}k=og.prototype;k.Na=function(a){if(a===this.u)return this;var b=Array(2*(this.g+1));hd(this.e,0,b,0,2*this.g);return new og(a,this.Ia,this.g,b)};
k.nb=function(a,b,c,d,e){b=ng(this.e,this.g,d);if(-1===b)return this;e[0]=!0;if(1===this.g)return null;a=this.Na(a);e=a.e;e[b]=e[2*this.g-2];e[b+1]=e[2*this.g-1];e[2*this.g-1]=null;e[2*this.g-2]=null;a.g-=1;return a};k.lb=function(){var a=this.e;return hg.b?hg.b(a):hg.call(null,a)};k.Xa=function(a,b){return eg(this.e,a,b)};k.Oa=function(a,b,c,d){a=ng(this.e,this.g,c);return 0>a?d:ag(c,this.e[a])?this.e[a+1]:d};
k.la=function(a,b,c,d,e,f){if(c===this.Ia){b=ng(this.e,this.g,d);if(-1===b){if(this.e.length>2*this.g)return a=dg.P(this,a,2*this.g,d,2*this.g+1,e),f.o=!0,a.g+=1,a;c=this.e.length;b=Array(c+2);hd(this.e,0,b,0,c);b[c]=d;b[c+1]=e;f.o=!0;f=this.g+1;a===this.u?(this.e=b,this.g=f,a=this):a=new og(this.u,this.Ia,f,b);return a}return this.e[b+1]===e?this:dg.n(this,a,b+1,e)}return(new fg(a,1<<(this.Ia>>>b&31),[null,this,null,null])).la(a,b,c,d,e,f)};
k.ka=function(a,b,c,d,e){return b===this.Ia?(a=ng(this.e,this.g,c),-1===a?(a=2*this.g,b=Array(a+2),hd(this.e,0,b,0,a),b[a]=c,b[a+1]=d,e.o=!0,new og(null,this.Ia,this.g+1,b)):sc.a(this.e[a],d)?this:new og(null,this.Ia,this.g,bg.c(this.e,a+1,d))):(new fg(null,1<<(this.Ia>>>a&31),[null,this])).ka(a,b,c,d,e)};k.mb=function(a,b,c){a=ng(this.e,this.g,c);return-1===a?this:1===this.g?null:new og(null,this.Ia,this.g-1,cg(this.e,Cd(a,2)))};
var kg=function(){function a(a,b,c,g,h,l,m){var p=nc(c);if(p===h)return new og(null,p,2,[c,g,l,m]);var q=new $f;return ig.la(a,b,p,c,g,q).la(a,b,h,l,m,q)}function b(a,b,c,g,h,l){var m=nc(b);if(m===g)return new og(null,m,2,[b,c,h,l]);var p=new $f;return ig.ka(a,m,b,c,p).ka(a,g,h,l,p)}var c=null,c=function(c,e,f,g,h,l,m){switch(arguments.length){case 6:return b.call(this,c,e,f,g,h,l);case 7:return a.call(this,c,e,f,g,h,l,m)}throw Error("Invalid arity: "+arguments.length);};c.P=b;c.ia=a;return c}();
function pg(a,b,c,d,e){this.k=a;this.Pa=b;this.m=c;this.C=d;this.p=e;this.q=0;this.j=32374860}k=pg.prototype;k.toString=function(){return ec(this)};k.H=function(){return this.k};k.B=function(){var a=this.p;return null!=a?a:this.p=a=wc(this)};k.A=function(a,b){return Ic(this,b)};k.J=function(){return O(J,this.k)};k.R=function(a,b){return P.a(b,this)};k.O=function(a,b,c){return P.c(b,c,this)};k.N=function(){return null==this.C?new W(null,2,5,uf,[this.Pa[this.m],this.Pa[this.m+1]],null):G(this.C)};
k.S=function(){if(null==this.C){var a=this.Pa,b=this.m+2;return hg.c?hg.c(a,b,null):hg.call(null,a,b,null)}var a=this.Pa,b=this.m,c=K(this.C);return hg.c?hg.c(a,b,c):hg.call(null,a,b,c)};k.D=function(){return this};k.F=function(a,b){return new pg(b,this.Pa,this.m,this.C,this.p)};k.G=function(a,b){return M(b,this)};pg.prototype[Ea]=function(){return uc(this)};
var hg=function(){function a(a,b,c){if(null==c)for(c=a.length;;)if(b<c){if(null!=a[b])return new pg(null,a,b,null,null);var g=a[b+1];if(t(g)&&(g=g.lb(),t(g)))return new pg(null,a,b+2,g,null);b+=2}else return null;else return new pg(null,a,b,c,null)}function b(a){return c.c(a,0,null)}var c=null,c=function(c,e,f){switch(arguments.length){case 1:return b.call(this,c);case 3:return a.call(this,c,e,f)}throw Error("Invalid arity: "+arguments.length);};c.b=b;c.c=a;return c}();
function qg(a,b,c,d,e){this.k=a;this.Pa=b;this.m=c;this.C=d;this.p=e;this.q=0;this.j=32374860}k=qg.prototype;k.toString=function(){return ec(this)};k.H=function(){return this.k};k.B=function(){var a=this.p;return null!=a?a:this.p=a=wc(this)};k.A=function(a,b){return Ic(this,b)};k.J=function(){return O(J,this.k)};k.R=function(a,b){return P.a(b,this)};k.O=function(a,b,c){return P.c(b,c,this)};k.N=function(){return G(this.C)};
k.S=function(){var a=this.Pa,b=this.m,c=K(this.C);return mg.n?mg.n(null,a,b,c):mg.call(null,null,a,b,c)};k.D=function(){return this};k.F=function(a,b){return new qg(b,this.Pa,this.m,this.C,this.p)};k.G=function(a,b){return M(b,this)};qg.prototype[Ea]=function(){return uc(this)};
var mg=function(){function a(a,b,c,g){if(null==g)for(g=b.length;;)if(c<g){var h=b[c];if(t(h)&&(h=h.lb(),t(h)))return new qg(a,b,c+1,h,null);c+=1}else return null;else return new qg(a,b,c,g,null)}function b(a){return c.n(null,a,0,null)}var c=null,c=function(c,e,f,g){switch(arguments.length){case 1:return b.call(this,c);case 4:return a.call(this,c,e,f,g)}throw Error("Invalid arity: "+arguments.length);};c.b=b;c.n=a;return c}();
function rg(a,b,c,d,e,f){this.k=a;this.g=b;this.root=c;this.U=d;this.da=e;this.p=f;this.j=16123663;this.q=8196}k=rg.prototype;k.toString=function(){return ec(this)};k.t=function(a,b){return $a.c(this,b,null)};k.s=function(a,b,c){return null==b?this.U?this.da:c:null==this.root?c:this.root.Oa(0,nc(b),b,c)};k.gb=function(a,b,c){this.U&&(a=this.da,c=b.c?b.c(c,null,a):b.call(null,c,null,a));return Ac(c)?L.b?L.b(c):L.call(null,c):null!=this.root?this.root.Xa(b,c):c};k.H=function(){return this.k};k.L=function(){return this.g};
k.B=function(){var a=this.p;return null!=a?a:this.p=a=xc(this)};k.A=function(a,b){return Pf(this,b)};k.$a=function(){return new sg({},this.root,this.g,this.U,this.da)};k.J=function(){return ub(Qc,this.k)};k.wb=function(a,b){if(null==b)return this.U?new rg(this.k,this.g-1,this.root,!1,null,null):this;if(null==this.root)return this;var c=this.root.mb(0,nc(b),b);return c===this.root?this:new rg(this.k,this.g-1,c,this.U,this.da,null)};
k.Ka=function(a,b,c){if(null==b)return this.U&&c===this.da?this:new rg(this.k,this.U?this.g:this.g+1,this.root,!0,c,null);a=new $f;b=(null==this.root?ig:this.root).ka(0,nc(b),b,c,a);return b===this.root?this:new rg(this.k,a.o?this.g+1:this.g,b,this.U,this.da,null)};k.rb=function(a,b){return null==b?this.U:null==this.root?!1:this.root.Oa(0,nc(b),b,jd)!==jd};k.D=function(){if(0<this.g){var a=null!=this.root?this.root.lb():null;return this.U?M(new W(null,2,5,uf,[null,this.da],null),a):a}return null};
k.F=function(a,b){return new rg(b,this.g,this.root,this.U,this.da,this.p)};k.G=function(a,b){if(ed(b))return cb(this,C.a(b,0),C.a(b,1));for(var c=this,d=D(b);;){if(null==d)return c;var e=G(d);if(ed(e))c=cb(c,C.a(e,0),C.a(e,1)),d=K(d);else throw Error("conj on a map takes map entries or seqables of map entries");}};
k.call=function(){var a=null,a=function(a,c,d){switch(arguments.length){case 2:return this.t(null,c);case 3:return this.s(null,c,d)}throw Error("Invalid arity: "+arguments.length);};a.a=function(a,c){return this.t(null,c)};a.c=function(a,c,d){return this.s(null,c,d)};return a}();k.apply=function(a,b){return this.call.apply(this,[this].concat(Fa(b)))};k.b=function(a){return this.t(null,a)};k.a=function(a,b){return this.s(null,a,b)};var Qc=new rg(null,0,null,!1,null,0);rg.prototype[Ea]=function(){return uc(this)};
function sg(a,b,c,d,e){this.u=a;this.root=b;this.count=c;this.U=d;this.da=e;this.q=56;this.j=258}k=sg.prototype;k.Jb=function(a,b){if(this.u)if(null==b)this.U&&(this.U=!1,this.da=null,this.count-=1);else{if(null!=this.root){var c=new $f,d=this.root.nb(this.u,0,nc(b),b,c);d!==this.root&&(this.root=d);t(c[0])&&(this.count-=1)}}else throw Error("dissoc! after persistent!");return this};k.kb=function(a,b,c){return tg(this,b,c)};k.Sa=function(a,b){return ug(this,b)};
k.Ta=function(){var a;if(this.u)this.u=null,a=new rg(null,this.count,this.root,this.U,this.da,null);else throw Error("persistent! called twice");return a};k.t=function(a,b){return null==b?this.U?this.da:null:null==this.root?null:this.root.Oa(0,nc(b),b)};k.s=function(a,b,c){return null==b?this.U?this.da:c:null==this.root?c:this.root.Oa(0,nc(b),b,c)};k.L=function(){if(this.u)return this.count;throw Error("count after persistent!");};
function ug(a,b){if(a.u){if(b?b.j&2048||b.jc||(b.j?0:w(fb,b)):w(fb,b))return tg(a,Yf.b?Yf.b(b):Yf.call(null,b),Zf.b?Zf.b(b):Zf.call(null,b));for(var c=D(b),d=a;;){var e=G(c);if(t(e))var f=e,c=K(c),d=tg(d,function(){var a=f;return Yf.b?Yf.b(a):Yf.call(null,a)}(),function(){var a=f;return Zf.b?Zf.b(a):Zf.call(null,a)}());else return d}}else throw Error("conj! after persistent");}
function tg(a,b,c){if(a.u){if(null==b)a.da!==c&&(a.da=c),a.U||(a.count+=1,a.U=!0);else{var d=new $f;b=(null==a.root?ig:a.root).la(a.u,0,nc(b),b,c,d);b!==a.root&&(a.root=b);d.o&&(a.count+=1)}return a}throw Error("assoc! after persistent!");}function vg(a,b,c){for(var d=b;;)if(null!=a)b=c?a.left:a.right,d=Nc.a(d,a),a=b;else return d}function wg(a,b,c,d,e){this.k=a;this.stack=b;this.pb=c;this.g=d;this.p=e;this.q=0;this.j=32374862}k=wg.prototype;k.toString=function(){return ec(this)};k.H=function(){return this.k};
k.L=function(){return 0>this.g?Q(K(this))+1:this.g};k.B=function(){var a=this.p;return null!=a?a:this.p=a=wc(this)};k.A=function(a,b){return Ic(this,b)};k.J=function(){return O(J,this.k)};k.R=function(a,b){return P.a(b,this)};k.O=function(a,b,c){return P.c(b,c,this)};k.N=function(){return Wc(this.stack)};k.S=function(){var a=G(this.stack),a=vg(this.pb?a.right:a.left,K(this.stack),this.pb);return null!=a?new wg(null,a,this.pb,this.g-1,null):J};k.D=function(){return this};
k.F=function(a,b){return new wg(b,this.stack,this.pb,this.g,this.p)};k.G=function(a,b){return M(b,this)};wg.prototype[Ea]=function(){return uc(this)};function xg(a,b,c){return new wg(null,vg(a,null,b),b,c,null)}
function yg(a,b,c,d){return c instanceof X?c.left instanceof X?new X(c.key,c.o,c.left.ua(),new Z(a,b,c.right,d,null),null):c.right instanceof X?new X(c.right.key,c.right.o,new Z(c.key,c.o,c.left,c.right.left,null),new Z(a,b,c.right.right,d,null),null):new Z(a,b,c,d,null):new Z(a,b,c,d,null)}
function zg(a,b,c,d){return d instanceof X?d.right instanceof X?new X(d.key,d.o,new Z(a,b,c,d.left,null),d.right.ua(),null):d.left instanceof X?new X(d.left.key,d.left.o,new Z(a,b,c,d.left.left,null),new Z(d.key,d.o,d.left.right,d.right,null),null):new Z(a,b,c,d,null):new Z(a,b,c,d,null)}
function Ag(a,b,c,d){if(c instanceof X)return new X(a,b,c.ua(),d,null);if(d instanceof Z)return zg(a,b,c,d.ob());if(d instanceof X&&d.left instanceof Z)return new X(d.left.key,d.left.o,new Z(a,b,c,d.left.left,null),zg(d.key,d.o,d.left.right,d.right.ob()),null);throw Error("red-black tree invariant violation");}
var Cg=function Bg(b,c,d){d=null!=b.left?Bg(b.left,c,d):d;if(Ac(d))return L.b?L.b(d):L.call(null,d);var e=b.key,f=b.o;d=c.c?c.c(d,e,f):c.call(null,d,e,f);if(Ac(d))return L.b?L.b(d):L.call(null,d);b=null!=b.right?Bg(b.right,c,d):d;return Ac(b)?L.b?L.b(b):L.call(null,b):b};function Z(a,b,c,d,e){this.key=a;this.o=b;this.left=c;this.right=d;this.p=e;this.q=0;this.j=32402207}k=Z.prototype;k.Mb=function(a){return a.Ob(this)};k.ob=function(){return new X(this.key,this.o,this.left,this.right,null)};
k.ua=function(){return this};k.Lb=function(a){return a.Nb(this)};k.replace=function(a,b,c,d){return new Z(a,b,c,d,null)};k.Nb=function(a){return new Z(a.key,a.o,this,a.right,null)};k.Ob=function(a){return new Z(a.key,a.o,a.left,this,null)};k.Xa=function(a,b){return Cg(this,a,b)};k.t=function(a,b){return C.c(this,b,null)};k.s=function(a,b,c){return C.c(this,b,c)};k.Q=function(a,b){return 0===b?this.key:1===b?this.o:null};k.$=function(a,b,c){return 0===b?this.key:1===b?this.o:c};
k.Ua=function(a,b,c){return(new W(null,2,5,uf,[this.key,this.o],null)).Ua(null,b,c)};k.H=function(){return null};k.L=function(){return 2};k.hb=function(){return this.key};k.ib=function(){return this.o};k.La=function(){return this.o};k.Ma=function(){return new W(null,1,5,uf,[this.key],null)};k.B=function(){var a=this.p;return null!=a?a:this.p=a=wc(this)};k.A=function(a,b){return Ic(this,b)};k.J=function(){return Mc};k.R=function(a,b){return Cc.a(this,b)};k.O=function(a,b,c){return Cc.c(this,b,c)};
k.Ka=function(a,b,c){return Rc.c(new W(null,2,5,uf,[this.key,this.o],null),b,c)};k.D=function(){return Ra(Ra(J,this.o),this.key)};k.F=function(a,b){return O(new W(null,2,5,uf,[this.key,this.o],null),b)};k.G=function(a,b){return new W(null,3,5,uf,[this.key,this.o,b],null)};
k.call=function(){var a=null,a=function(a,c,d){switch(arguments.length){case 2:return this.t(null,c);case 3:return this.s(null,c,d)}throw Error("Invalid arity: "+arguments.length);};a.a=function(a,c){return this.t(null,c)};a.c=function(a,c,d){return this.s(null,c,d)};return a}();k.apply=function(a,b){return this.call.apply(this,[this].concat(Fa(b)))};k.b=function(a){return this.t(null,a)};k.a=function(a,b){return this.s(null,a,b)};Z.prototype[Ea]=function(){return uc(this)};
function X(a,b,c,d,e){this.key=a;this.o=b;this.left=c;this.right=d;this.p=e;this.q=0;this.j=32402207}k=X.prototype;k.Mb=function(a){return new X(this.key,this.o,this.left,a,null)};k.ob=function(){throw Error("red-black tree invariant violation");};k.ua=function(){return new Z(this.key,this.o,this.left,this.right,null)};k.Lb=function(a){return new X(this.key,this.o,a,this.right,null)};k.replace=function(a,b,c,d){return new X(a,b,c,d,null)};
k.Nb=function(a){return this.left instanceof X?new X(this.key,this.o,this.left.ua(),new Z(a.key,a.o,this.right,a.right,null),null):this.right instanceof X?new X(this.right.key,this.right.o,new Z(this.key,this.o,this.left,this.right.left,null),new Z(a.key,a.o,this.right.right,a.right,null),null):new Z(a.key,a.o,this,a.right,null)};
k.Ob=function(a){return this.right instanceof X?new X(this.key,this.o,new Z(a.key,a.o,a.left,this.left,null),this.right.ua(),null):this.left instanceof X?new X(this.left.key,this.left.o,new Z(a.key,a.o,a.left,this.left.left,null),new Z(this.key,this.o,this.left.right,this.right,null),null):new Z(a.key,a.o,a.left,this,null)};k.Xa=function(a,b){return Cg(this,a,b)};k.t=function(a,b){return C.c(this,b,null)};k.s=function(a,b,c){return C.c(this,b,c)};
k.Q=function(a,b){return 0===b?this.key:1===b?this.o:null};k.$=function(a,b,c){return 0===b?this.key:1===b?this.o:c};k.Ua=function(a,b,c){return(new W(null,2,5,uf,[this.key,this.o],null)).Ua(null,b,c)};k.H=function(){return null};k.L=function(){return 2};k.hb=function(){return this.key};k.ib=function(){return this.o};k.La=function(){return this.o};k.Ma=function(){return new W(null,1,5,uf,[this.key],null)};k.B=function(){var a=this.p;return null!=a?a:this.p=a=wc(this)};
k.A=function(a,b){return Ic(this,b)};k.J=function(){return Mc};k.R=function(a,b){return Cc.a(this,b)};k.O=function(a,b,c){return Cc.c(this,b,c)};k.Ka=function(a,b,c){return Rc.c(new W(null,2,5,uf,[this.key,this.o],null),b,c)};k.D=function(){return Ra(Ra(J,this.o),this.key)};k.F=function(a,b){return O(new W(null,2,5,uf,[this.key,this.o],null),b)};k.G=function(a,b){return new W(null,3,5,uf,[this.key,this.o,b],null)};
k.call=function(){var a=null,a=function(a,c,d){switch(arguments.length){case 2:return this.t(null,c);case 3:return this.s(null,c,d)}throw Error("Invalid arity: "+arguments.length);};a.a=function(a,c){return this.t(null,c)};a.c=function(a,c,d){return this.s(null,c,d)};return a}();k.apply=function(a,b){return this.call.apply(this,[this].concat(Fa(b)))};k.b=function(a){return this.t(null,a)};k.a=function(a,b){return this.s(null,a,b)};X.prototype[Ea]=function(){return uc(this)};
var Eg=function Dg(b,c,d,e,f){if(null==c)return new X(d,e,null,null,null);var g;g=c.key;g=b.a?b.a(d,g):b.call(null,d,g);if(0===g)return f[0]=c,null;if(0>g)return b=Dg(b,c.left,d,e,f),null!=b?c.Lb(b):null;b=Dg(b,c.right,d,e,f);return null!=b?c.Mb(b):null},Gg=function Fg(b,c){if(null==b)return c;if(null==c)return b;if(b instanceof X){if(c instanceof X){var d=Fg(b.right,c.left);return d instanceof X?new X(d.key,d.o,new X(b.key,b.o,b.left,d.left,null),new X(c.key,c.o,d.right,c.right,null),null):new X(b.key,
b.o,b.left,new X(c.key,c.o,d,c.right,null),null)}return new X(b.key,b.o,b.left,Fg(b.right,c),null)}if(c instanceof X)return new X(c.key,c.o,Fg(b,c.left),c.right,null);d=Fg(b.right,c.left);return d instanceof X?new X(d.key,d.o,new Z(b.key,b.o,b.left,d.left,null),new Z(c.key,c.o,d.right,c.right,null),null):Ag(b.key,b.o,b.left,new Z(c.key,c.o,d,c.right,null))},Ig=function Hg(b,c,d,e){if(null!=c){var f;f=c.key;f=b.a?b.a(d,f):b.call(null,d,f);if(0===f)return e[0]=c,Gg(c.left,c.right);if(0>f)return b=Hg(b,
c.left,d,e),null!=b||null!=e[0]?c.left instanceof Z?Ag(c.key,c.o,b,c.right):new X(c.key,c.o,b,c.right,null):null;b=Hg(b,c.right,d,e);if(null!=b||null!=e[0])if(c.right instanceof Z)if(e=c.key,d=c.o,c=c.left,b instanceof X)c=new X(e,d,c,b.ua(),null);else if(c instanceof Z)c=yg(e,d,c.ob(),b);else if(c instanceof X&&c.right instanceof Z)c=new X(c.right.key,c.right.o,yg(c.key,c.o,c.left.ob(),c.right.left),new Z(e,d,c.right.right,b,null),null);else throw Error("red-black tree invariant violation");else c=
new X(c.key,c.o,c.left,b,null);else c=null;return c}return null},Kg=function Jg(b,c,d,e){var f=c.key,g=b.a?b.a(d,f):b.call(null,d,f);return 0===g?c.replace(f,e,c.left,c.right):0>g?c.replace(f,c.o,Jg(b,c.left,d,e),c.right):c.replace(f,c.o,c.left,Jg(b,c.right,d,e))};function Lg(a,b,c,d,e){this.aa=a;this.na=b;this.g=c;this.k=d;this.p=e;this.j=418776847;this.q=8192}k=Lg.prototype;k.toString=function(){return ec(this)};
function Mg(a,b){for(var c=a.na;;)if(null!=c){var d;d=c.key;d=a.aa.a?a.aa.a(b,d):a.aa.call(null,b,d);if(0===d)return c;c=0>d?c.left:c.right}else return null}k.t=function(a,b){return $a.c(this,b,null)};k.s=function(a,b,c){a=Mg(this,b);return null!=a?a.o:c};k.gb=function(a,b,c){return null!=this.na?Cg(this.na,b,c):c};k.H=function(){return this.k};k.L=function(){return this.g};k.ab=function(){return 0<this.g?xg(this.na,!1,this.g):null};k.B=function(){var a=this.p;return null!=a?a:this.p=a=xc(this)};
k.A=function(a,b){return Pf(this,b)};k.J=function(){return new Lg(this.aa,null,0,this.k,0)};k.wb=function(a,b){var c=[null],d=Ig(this.aa,this.na,b,c);return null==d?null==R.a(c,0)?this:new Lg(this.aa,null,0,this.k,null):new Lg(this.aa,d.ua(),this.g-1,this.k,null)};k.Ka=function(a,b,c){a=[null];var d=Eg(this.aa,this.na,b,c,a);return null==d?(a=R.a(a,0),sc.a(c,a.o)?this:new Lg(this.aa,Kg(this.aa,this.na,b,c),this.g,this.k,null)):new Lg(this.aa,d.ua(),this.g+1,this.k,null)};
k.rb=function(a,b){return null!=Mg(this,b)};k.D=function(){return 0<this.g?xg(this.na,!0,this.g):null};k.F=function(a,b){return new Lg(this.aa,this.na,this.g,b,this.p)};k.G=function(a,b){if(ed(b))return cb(this,C.a(b,0),C.a(b,1));for(var c=this,d=D(b);;){if(null==d)return c;var e=G(d);if(ed(e))c=cb(c,C.a(e,0),C.a(e,1)),d=K(d);else throw Error("conj on a map takes map entries or seqables of map entries");}};
k.call=function(){var a=null,a=function(a,c,d){switch(arguments.length){case 2:return this.t(null,c);case 3:return this.s(null,c,d)}throw Error("Invalid arity: "+arguments.length);};a.a=function(a,c){return this.t(null,c)};a.c=function(a,c,d){return this.s(null,c,d)};return a}();k.apply=function(a,b){return this.call.apply(this,[this].concat(Fa(b)))};k.b=function(a){return this.t(null,a)};k.a=function(a,b){return this.s(null,a,b)};k.Hb=function(a,b){return 0<this.g?xg(this.na,b,this.g):null};
k.Ib=function(a,b,c){if(0<this.g){a=null;for(var d=this.na;;)if(null!=d){var e;e=d.key;e=this.aa.a?this.aa.a(b,e):this.aa.call(null,b,e);if(0===e)return new wg(null,Nc.a(a,d),c,-1,null);t(c)?0>e?(a=Nc.a(a,d),d=d.left):d=d.right:0<e?(a=Nc.a(a,d),d=d.right):d=d.left}else return null==a?null:new wg(null,a,c,-1,null)}else return null};k.Gb=function(a,b){return Yf.b?Yf.b(b):Yf.call(null,b)};k.Fb=function(){return this.aa};var Ng=new Lg(od,null,0,null,0);Lg.prototype[Ea]=function(){return uc(this)};
var Og=function(){function a(a){var d=null;if(0<arguments.length){for(var d=0,e=Array(arguments.length-0);d<e.length;)e[d]=arguments[d+0],++d;d=new F(e,0)}return b.call(this,d)}function b(a){a=D(a);for(var b=Ob(Qc);;)if(a){var e=K(K(a)),b=ee.c(b,G(a),Lc(a));a=e}else return Qb(b)}a.i=0;a.f=function(a){a=D(a);return b(a)};a.d=b;return a}(),Pg=function(){function a(a){var d=null;if(0<arguments.length){for(var d=0,e=Array(arguments.length-0);d<e.length;)e[d]=arguments[d+0],++d;d=new F(e,0)}return b.call(this,
d)}function b(a){a:{a=T.a(Ha,a);for(var b=a.length,e=0,f=Ob(Uf);;)if(e<b)var g=e+2,f=Rb(f,a[e],a[e+1]),e=g;else{a=Qb(f);break a}a=void 0}return a}a.i=0;a.f=function(a){a=D(a);return b(a)};a.d=b;return a}(),Qg=function(){function a(a){var d=null;if(0<arguments.length){for(var d=0,e=Array(arguments.length-0);d<e.length;)e[d]=arguments[d+0],++d;d=new F(e,0)}return b.call(this,d)}function b(a){a=D(a);for(var b=Ng;;)if(a){var e=K(K(a)),b=Rc.c(b,G(a),Lc(a));a=e}else return b}a.i=0;a.f=function(a){a=D(a);
return b(a)};a.d=b;return a}(),Rg=function(){function a(a,d){var e=null;if(1<arguments.length){for(var e=0,f=Array(arguments.length-1);e<f.length;)f[e]=arguments[e+1],++e;e=new F(f,0)}return b.call(this,a,e)}function b(a,b){for(var e=D(b),f=new Lg(qd(a),null,0,null,0);;)if(e)var g=K(K(e)),f=Rc.c(f,G(e),Lc(e)),e=g;else return f}a.i=1;a.f=function(a){var d=G(a);a=H(a);return b(d,a)};a.d=b;return a}();function Sg(a,b){this.Y=a;this.Z=b;this.q=0;this.j=32374988}k=Sg.prototype;k.toString=function(){return ec(this)};
k.H=function(){return this.Z};k.T=function(){var a=this.Y,a=(a?a.j&128||a.xb||(a.j?0:w(Xa,a)):w(Xa,a))?this.Y.T(null):K(this.Y);return null==a?null:new Sg(a,this.Z)};k.B=function(){return wc(this)};k.A=function(a,b){return Ic(this,b)};k.J=function(){return O(J,this.Z)};k.R=function(a,b){return P.a(b,this)};k.O=function(a,b,c){return P.c(b,c,this)};k.N=function(){return this.Y.N(null).hb(null)};
k.S=function(){var a=this.Y,a=(a?a.j&128||a.xb||(a.j?0:w(Xa,a)):w(Xa,a))?this.Y.T(null):K(this.Y);return null!=a?new Sg(a,this.Z):J};k.D=function(){return this};k.F=function(a,b){return new Sg(this.Y,b)};k.G=function(a,b){return M(b,this)};Sg.prototype[Ea]=function(){return uc(this)};function Tg(a){return(a=D(a))?new Sg(a,null):null}function Yf(a){return hb(a)}function Ug(a,b){this.Y=a;this.Z=b;this.q=0;this.j=32374988}k=Ug.prototype;k.toString=function(){return ec(this)};k.H=function(){return this.Z};
k.T=function(){var a=this.Y,a=(a?a.j&128||a.xb||(a.j?0:w(Xa,a)):w(Xa,a))?this.Y.T(null):K(this.Y);return null==a?null:new Ug(a,this.Z)};k.B=function(){return wc(this)};k.A=function(a,b){return Ic(this,b)};k.J=function(){return O(J,this.Z)};k.R=function(a,b){return P.a(b,this)};k.O=function(a,b,c){return P.c(b,c,this)};k.N=function(){return this.Y.N(null).ib(null)};k.S=function(){var a=this.Y,a=(a?a.j&128||a.xb||(a.j?0:w(Xa,a)):w(Xa,a))?this.Y.T(null):K(this.Y);return null!=a?new Ug(a,this.Z):J};
k.D=function(){return this};k.F=function(a,b){return new Ug(this.Y,b)};k.G=function(a,b){return M(b,this)};Ug.prototype[Ea]=function(){return uc(this)};function Vg(a){return(a=D(a))?new Ug(a,null):null}function Zf(a){return ib(a)}
var Wg=function(){function a(a){var d=null;if(0<arguments.length){for(var d=0,e=Array(arguments.length-0);d<e.length;)e[d]=arguments[d+0],++d;d=new F(e,0)}return b.call(this,d)}function b(a){return t(Fe(ud,a))?A.a(function(a,b){return Nc.a(t(a)?a:Uf,b)},a):null}a.i=0;a.f=function(a){a=D(a);return b(a)};a.d=b;return a}(),Xg=function(){function a(a,d){var e=null;if(1<arguments.length){for(var e=0,f=Array(arguments.length-1);e<f.length;)f[e]=arguments[e+1],++e;e=new F(f,0)}return b.call(this,a,e)}function b(a,
b){return t(Fe(ud,b))?A.a(function(a){return function(b,c){return A.c(a,t(b)?b:Uf,D(c))}}(function(b,d){var g=G(d),h=Lc(d);return nd(b,g)?Rc.c(b,g,function(){var d=S.a(b,g);return a.a?a.a(d,h):a.call(null,d,h)}()):Rc.c(b,g,h)}),b):null}a.i=1;a.f=function(a){var d=G(a);a=H(a);return b(d,a)};a.d=b;return a}();function Yg(a,b){for(var c=Uf,d=D(b);;)if(d)var e=G(d),f=S.c(a,e,Zg),c=je.a(f,Zg)?Rc.c(c,e,f):c,d=K(d);else return O(c,Vc(a))}
function $g(a,b,c){this.k=a;this.Wa=b;this.p=c;this.j=15077647;this.q=8196}k=$g.prototype;k.toString=function(){return ec(this)};k.t=function(a,b){return $a.c(this,b,null)};k.s=function(a,b,c){return bb(this.Wa,b)?b:c};k.H=function(){return this.k};k.L=function(){return Ma(this.Wa)};k.B=function(){var a=this.p;return null!=a?a:this.p=a=xc(this)};k.A=function(a,b){return ad(b)&&Q(this)===Q(b)&&Ee(function(a){return function(b){return nd(a,b)}}(this),b)};k.$a=function(){return new ah(Ob(this.Wa))};
k.J=function(){return O(bh,this.k)};k.Eb=function(a,b){return new $g(this.k,eb(this.Wa,b),null)};k.D=function(){return Tg(this.Wa)};k.F=function(a,b){return new $g(b,this.Wa,this.p)};k.G=function(a,b){return new $g(this.k,Rc.c(this.Wa,b,null),null)};
k.call=function(){var a=null,a=function(a,c,d){switch(arguments.length){case 2:return this.t(null,c);case 3:return this.s(null,c,d)}throw Error("Invalid arity: "+arguments.length);};a.a=function(a,c){return this.t(null,c)};a.c=function(a,c,d){return this.s(null,c,d)};return a}();k.apply=function(a,b){return this.call.apply(this,[this].concat(Fa(b)))};k.b=function(a){return this.t(null,a)};k.a=function(a,b){return this.s(null,a,b)};var bh=new $g(null,Uf,0);$g.prototype[Ea]=function(){return uc(this)};
function ah(a){this.ma=a;this.j=259;this.q=136}k=ah.prototype;k.call=function(){function a(a,b,c){return $a.c(this.ma,b,jd)===jd?c:b}function b(a,b){return $a.c(this.ma,b,jd)===jd?null:b}var c=null,c=function(c,e,f){switch(arguments.length){case 2:return b.call(this,c,e);case 3:return a.call(this,c,e,f)}throw Error("Invalid arity: "+arguments.length);};c.a=b;c.c=a;return c}();k.apply=function(a,b){return this.call.apply(this,[this].concat(Fa(b)))};
k.b=function(a){return $a.c(this.ma,a,jd)===jd?null:a};k.a=function(a,b){return $a.c(this.ma,a,jd)===jd?b:a};k.t=function(a,b){return $a.c(this,b,null)};k.s=function(a,b,c){return $a.c(this.ma,b,jd)===jd?c:b};k.L=function(){return Q(this.ma)};k.Tb=function(a,b){this.ma=fe.a(this.ma,b);return this};k.Sa=function(a,b){this.ma=ee.c(this.ma,b,null);return this};k.Ta=function(){return new $g(null,Qb(this.ma),null)};function ch(a,b,c){this.k=a;this.ja=b;this.p=c;this.j=417730831;this.q=8192}k=ch.prototype;
k.toString=function(){return ec(this)};k.t=function(a,b){return $a.c(this,b,null)};k.s=function(a,b,c){a=Mg(this.ja,b);return null!=a?a.key:c};k.H=function(){return this.k};k.L=function(){return Q(this.ja)};k.ab=function(){return 0<Q(this.ja)?Oe.a(Yf,Gb(this.ja)):null};k.B=function(){var a=this.p;return null!=a?a:this.p=a=xc(this)};k.A=function(a,b){return ad(b)&&Q(this)===Q(b)&&Ee(function(a){return function(b){return nd(a,b)}}(this),b)};k.J=function(){return new ch(this.k,Na(this.ja),0)};
k.Eb=function(a,b){return new ch(this.k,Sc.a(this.ja,b),null)};k.D=function(){return Tg(this.ja)};k.F=function(a,b){return new ch(b,this.ja,this.p)};k.G=function(a,b){return new ch(this.k,Rc.c(this.ja,b,null),null)};k.call=function(){var a=null,a=function(a,c,d){switch(arguments.length){case 2:return this.t(null,c);case 3:return this.s(null,c,d)}throw Error("Invalid arity: "+arguments.length);};a.a=function(a,c){return this.t(null,c)};a.c=function(a,c,d){return this.s(null,c,d)};return a}();
k.apply=function(a,b){return this.call.apply(this,[this].concat(Fa(b)))};k.b=function(a){return this.t(null,a)};k.a=function(a,b){return this.s(null,a,b)};k.Hb=function(a,b){return Oe.a(Yf,Hb(this.ja,b))};k.Ib=function(a,b,c){return Oe.a(Yf,Ib(this.ja,b,c))};k.Gb=function(a,b){return b};k.Fb=function(){return Kb(this.ja)};var eh=new ch(null,Ng,0);ch.prototype[Ea]=function(){return uc(this)};
function fh(a){a=D(a);if(null==a)return bh;if(a instanceof F&&0===a.m){a=a.e;a:{for(var b=0,c=Ob(bh);;)if(b<a.length)var d=b+1,c=c.Sa(null,a[b]),b=d;else{a=c;break a}a=void 0}return a.Ta(null)}for(d=Ob(bh);;)if(null!=a)b=a.T(null),d=d.Sa(null,a.N(null)),a=b;else return d.Ta(null)}
var gh=function(){function a(a){var d=null;if(0<arguments.length){for(var d=0,e=Array(arguments.length-0);d<e.length;)e[d]=arguments[d+0],++d;d=new F(e,0)}return b.call(this,d)}function b(a){return A.c(Ra,eh,a)}a.i=0;a.f=function(a){a=D(a);return b(a)};a.d=b;return a}(),hh=function(){function a(a,d){var e=null;if(1<arguments.length){for(var e=0,f=Array(arguments.length-1);e<f.length;)f[e]=arguments[e+1],++e;e=new F(f,0)}return b.call(this,a,e)}function b(a,b){return A.c(Ra,new ch(null,Rg(a),0),b)}
a.i=1;a.f=function(a){var d=G(a);a=H(a);return b(d,a)};a.d=b;return a}();function Od(a){if(a&&(a.q&4096||a.lc))return a.name;if("string"===typeof a)return a;throw Error([z("Doesn't support name: "),z(a)].join(""));}
var ih=function(){function a(a,b,c){return(a.b?a.b(b):a.call(null,b))>(a.b?a.b(c):a.call(null,c))?b:c}var b=null,c=function(){function a(b,d,h,l){var m=null;if(3<arguments.length){for(var m=0,p=Array(arguments.length-3);m<p.length;)p[m]=arguments[m+3],++m;m=new F(p,0)}return c.call(this,b,d,h,m)}function c(a,d,e,l){return A.c(function(c,d){return b.c(a,c,d)},b.c(a,d,e),l)}a.i=3;a.f=function(a){var b=G(a);a=K(a);var d=G(a);a=K(a);var l=G(a);a=H(a);return c(b,d,l,a)};a.d=c;return a}(),b=function(b,
e,f,g){switch(arguments.length){case 2:return e;case 3:return a.call(this,b,e,f);default:var h=null;if(3<arguments.length){for(var h=0,l=Array(arguments.length-3);h<l.length;)l[h]=arguments[h+3],++h;h=new F(l,0)}return c.d(b,e,f,h)}throw Error("Invalid arity: "+arguments.length);};b.i=3;b.f=c.f;b.a=function(a,b){return b};b.c=a;b.d=c.d;return b}();function jh(a){this.e=a}jh.prototype.add=function(a){return this.e.push(a)};jh.prototype.size=function(){return this.e.length};
jh.prototype.clear=function(){return this.e=[]};
var kh=function(){function a(a,b,c){return new V(null,function(){var h=D(c);return h?M(Pe.a(a,h),d.c(a,b,Qe.a(b,h))):null},null,null)}function b(a,b){return d.c(a,a,b)}function c(a){return function(b){return function(c){return function(){function d(h,l){c.add(l);if(a===c.size()){var m=zf(c.e);c.clear();return b.a?b.a(h,m):b.call(null,h,m)}return h}function l(a){if(!t(0===c.e.length)){var d=zf(c.e);c.clear();a=Bc(b.a?b.a(a,d):b.call(null,a,d))}return b.b?b.b(a):b.call(null,a)}function m(){return b.l?
b.l():b.call(null)}var p=null,p=function(a,b){switch(arguments.length){case 0:return m.call(this);case 1:return l.call(this,a);case 2:return d.call(this,a,b)}throw Error("Invalid arity: "+arguments.length);};p.l=m;p.b=l;p.a=d;return p}()}(new jh([]))}}var d=null,d=function(d,f,g){switch(arguments.length){case 1:return c.call(this,d);case 2:return b.call(this,d,f);case 3:return a.call(this,d,f,g)}throw Error("Invalid arity: "+arguments.length);};d.b=c;d.a=b;d.c=a;return d}(),lh=function(){function a(a,
b){return new V(null,function(){var f=D(b);if(f){var g;g=G(f);g=a.b?a.b(g):a.call(null,g);f=t(g)?M(G(f),c.a(a,H(f))):null}else f=null;return f},null,null)}function b(a){return function(b){return function(){function c(f,g){return t(a.b?a.b(g):a.call(null,g))?b.a?b.a(f,g):b.call(null,f,g):new yc(f)}function g(a){return b.b?b.b(a):b.call(null,a)}function h(){return b.l?b.l():b.call(null)}var l=null,l=function(a,b){switch(arguments.length){case 0:return h.call(this);case 1:return g.call(this,a);case 2:return c.call(this,
a,b)}throw Error("Invalid arity: "+arguments.length);};l.l=h;l.b=g;l.a=c;return l}()}}var c=null,c=function(c,e){switch(arguments.length){case 1:return b.call(this,c);case 2:return a.call(this,c,e)}throw Error("Invalid arity: "+arguments.length);};c.b=b;c.a=a;return c}();function mh(a,b,c){return function(d){var e=Kb(a);d=Jb(a,d);e=e.a?e.a(d,c):e.call(null,d,c);return b.a?b.a(e,0):b.call(null,e,0)}}
var nh=function(){function a(a,b,c,g,h){var l=Ib(a,c,!0);if(t(l)){var m=R.c(l,0,null);return lh.a(mh(a,g,h),t(mh(a,b,c).call(null,m))?l:K(l))}return null}function b(a,b,c){var g=mh(a,b,c),h;a:{h=[Ad,Bd];var l=h.length;if(l<=Vf)for(var m=0,p=Ob(Uf);;)if(m<l)var q=m+1,p=Rb(p,h[m],null),m=q;else{h=new $g(null,Qb(p),null);break a}else for(m=0,p=Ob(bh);;)if(m<l)q=m+1,p=Pb(p,h[m]),m=q;else{h=Qb(p);break a}h=void 0}return t(h.call(null,b))?(a=Ib(a,c,!0),t(a)?(b=R.c(a,0,null),t(g.b?g.b(b):g.call(null,b))?
a:K(a)):null):lh.a(g,Hb(a,!0))}var c=null,c=function(c,e,f,g,h){switch(arguments.length){case 3:return b.call(this,c,e,f);case 5:return a.call(this,c,e,f,g,h)}throw Error("Invalid arity: "+arguments.length);};c.c=b;c.r=a;return c}();function oh(a,b,c){this.m=a;this.end=b;this.step=c}oh.prototype.ga=function(){return 0<this.step?this.m<this.end:this.m>this.end};oh.prototype.next=function(){var a=this.m;this.m+=this.step;return a};
function ph(a,b,c,d,e){this.k=a;this.start=b;this.end=c;this.step=d;this.p=e;this.j=32375006;this.q=8192}k=ph.prototype;k.toString=function(){return ec(this)};k.Q=function(a,b){if(b<Ma(this))return this.start+b*this.step;if(this.start>this.end&&0===this.step)return this.start;throw Error("Index out of bounds");};k.$=function(a,b,c){return b<Ma(this)?this.start+b*this.step:this.start>this.end&&0===this.step?this.start:c};k.vb=!0;k.fb=function(){return new oh(this.start,this.end,this.step)};k.H=function(){return this.k};
k.T=function(){return 0<this.step?this.start+this.step<this.end?new ph(this.k,this.start+this.step,this.end,this.step,null):null:this.start+this.step>this.end?new ph(this.k,this.start+this.step,this.end,this.step,null):null};k.L=function(){if(Aa(Cb(this)))return 0;var a=(this.end-this.start)/this.step;return Math.ceil.b?Math.ceil.b(a):Math.ceil.call(null,a)};k.B=function(){var a=this.p;return null!=a?a:this.p=a=wc(this)};k.A=function(a,b){return Ic(this,b)};k.J=function(){return O(J,this.k)};
k.R=function(a,b){return Cc.a(this,b)};k.O=function(a,b,c){for(a=this.start;;)if(0<this.step?a<this.end:a>this.end){var d=a;c=b.a?b.a(c,d):b.call(null,c,d);if(Ac(c))return b=c,L.b?L.b(b):L.call(null,b);a+=this.step}else return c};k.N=function(){return null==Cb(this)?null:this.start};k.S=function(){return null!=Cb(this)?new ph(this.k,this.start+this.step,this.end,this.step,null):J};k.D=function(){return 0<this.step?this.start<this.end?this:null:this.start>this.end?this:null};
k.F=function(a,b){return new ph(b,this.start,this.end,this.step,this.p)};k.G=function(a,b){return M(b,this)};ph.prototype[Ea]=function(){return uc(this)};
var qh=function(){function a(a,b,c){return new ph(null,a,b,c,null)}function b(a,b){return e.c(a,b,1)}function c(a){return e.c(0,a,1)}function d(){return e.c(0,Number.MAX_VALUE,1)}var e=null,e=function(e,g,h){switch(arguments.length){case 0:return d.call(this);case 1:return c.call(this,e);case 2:return b.call(this,e,g);case 3:return a.call(this,e,g,h)}throw Error("Invalid arity: "+arguments.length);};e.l=d;e.b=c;e.a=b;e.c=a;return e}(),rh=function(){function a(a,b){return new V(null,function(){var f=
D(b);return f?M(G(f),c.a(a,Qe.a(a,f))):null},null,null)}function b(a){return function(b){return function(c){return function(){function g(g,h){var l=c.bb(0,c.Ra(null)+1),m=Cd(l,a);return 0===l-a*m?b.a?b.a(g,h):b.call(null,g,h):g}function h(a){return b.b?b.b(a):b.call(null,a)}function l(){return b.l?b.l():b.call(null)}var m=null,m=function(a,b){switch(arguments.length){case 0:return l.call(this);case 1:return h.call(this,a);case 2:return g.call(this,a,b)}throw Error("Invalid arity: "+arguments.length);
};m.l=l;m.b=h;m.a=g;return m}()}(new Me(-1))}}var c=null,c=function(c,e){switch(arguments.length){case 1:return b.call(this,c);case 2:return a.call(this,c,e)}throw Error("Invalid arity: "+arguments.length);};c.b=b;c.a=a;return c}(),th=function(){function a(a,b){return new V(null,function(){var f=D(b);if(f){var g=G(f),h=a.b?a.b(g):a.call(null,g),g=M(g,lh.a(function(b,c){return function(b){return sc.a(c,a.b?a.b(b):a.call(null,b))}}(g,h,f,f),K(f)));return M(g,c.a(a,D(Qe.a(Q(g),f))))}return null},null,
null)}function b(a){return function(b){return function(c,g){return function(){function h(h,l){var m=L.b?L.b(g):L.call(null,g),p=a.b?a.b(l):a.call(null,l);ac(g,p);if(Nd(m,sh)||sc.a(p,m))return c.add(l),h;m=zf(c.e);c.clear();m=b.a?b.a(h,m):b.call(null,h,m);Ac(m)||c.add(l);return m}function l(a){if(!t(0===c.e.length)){var d=zf(c.e);c.clear();a=Bc(b.a?b.a(a,d):b.call(null,a,d))}return b.b?b.b(a):b.call(null,a)}function m(){return b.l?b.l():b.call(null)}var p=null,p=function(a,b){switch(arguments.length){case 0:return m.call(this);
case 1:return l.call(this,a);case 2:return h.call(this,a,b)}throw Error("Invalid arity: "+arguments.length);};p.l=m;p.b=l;p.a=h;return p}()}(new jh([]),new Me(sh))}}var c=null,c=function(c,e){switch(arguments.length){case 1:return b.call(this,c);case 2:return a.call(this,c,e)}throw Error("Invalid arity: "+arguments.length);};c.b=b;c.a=a;return c}(),uh=function(){function a(a,b){for(;;)if(D(b)&&0<a){var c=a-1,g=K(b);a=c;b=g}else return null}function b(a){for(;;)if(D(a))a=K(a);else return null}var c=
null,c=function(c,e){switch(arguments.length){case 1:return b.call(this,c);case 2:return a.call(this,c,e)}throw Error("Invalid arity: "+arguments.length);};c.b=b;c.a=a;return c}(),vh=function(){function a(a,b){uh.a(a,b);return b}function b(a){uh.b(a);return a}var c=null,c=function(c,e){switch(arguments.length){case 1:return b.call(this,c);case 2:return a.call(this,c,e)}throw Error("Invalid arity: "+arguments.length);};c.b=b;c.a=a;return c}();
function wh(a,b,c,d,e,f,g){var h=ma;try{ma=null==ma?null:ma-1;if(null!=ma&&0>ma)return Lb(a,"#");Lb(a,c);if(D(g)){var l=G(g);b.c?b.c(l,a,f):b.call(null,l,a,f)}for(var m=K(g),p=za.b(f)-1;;)if(!m||null!=p&&0===p){D(m)&&0===p&&(Lb(a,d),Lb(a,"..."));break}else{Lb(a,d);var q=G(m);c=a;g=f;b.c?b.c(q,c,g):b.call(null,q,c,g);var s=K(m);c=p-1;m=s;p=c}return Lb(a,e)}finally{ma=h}}
var xh=function(){function a(a,d){var e=null;if(1<arguments.length){for(var e=0,f=Array(arguments.length-1);e<f.length;)f[e]=arguments[e+1],++e;e=new F(f,0)}return b.call(this,a,e)}function b(a,b){for(var e=D(b),f=null,g=0,h=0;;)if(h<g){var l=f.Q(null,h);Lb(a,l);h+=1}else if(e=D(e))f=e,fd(f)?(e=Yb(f),g=Zb(f),f=e,l=Q(e),e=g,g=l):(l=G(f),Lb(a,l),e=K(f),f=null,g=0),h=0;else return null}a.i=1;a.f=function(a){var d=G(a);a=H(a);return b(d,a)};a.d=b;return a}(),yh={'"':'\\"',"\\":"\\\\","\b":"\\b","\f":"\\f",
"\n":"\\n","\r":"\\r","\t":"\\t"};function zh(a){return[z('"'),z(a.replace(RegExp('[\\\\"\b\f\n\r\t]',"g"),function(a){return yh[a]})),z('"')].join("")}
var $=function Ah(b,c,d){if(null==b)return Lb(c,"nil");if(void 0===b)return Lb(c,"#\x3cundefined\x3e");t(function(){var c=S.a(d,wa);return t(c)?(c=b?b.j&131072||b.kc?!0:b.j?!1:w(rb,b):w(rb,b))?Vc(b):c:c}())&&(Lb(c,"^"),Ah(Vc(b),c,d),Lb(c," "));if(null==b)return Lb(c,"nil");if(b.Yb)return b.nc(c);if(b&&(b.j&2147483648||b.I))return b.v(null,c,d);if(Ba(b)===Boolean||"number"===typeof b)return Lb(c,""+z(b));if(null!=b&&b.constructor===Object){Lb(c,"#js ");var e=Oe.a(function(c){return new W(null,2,5,
uf,[Pd.b(c),b[c]],null)},gd(b));return Bh.n?Bh.n(e,Ah,c,d):Bh.call(null,e,Ah,c,d)}return b instanceof Array?wh(c,Ah,"#js ["," ","]",d,b):t("string"==typeof b)?t(ua.b(d))?Lb(c,zh(b)):Lb(c,b):Tc(b)?xh.d(c,Kc(["#\x3c",""+z(b),"\x3e"],0)):b instanceof Date?(e=function(b,c){for(var d=""+z(b);;)if(Q(d)<c)d=[z("0"),z(d)].join("");else return d},xh.d(c,Kc(['#inst "',""+z(b.getUTCFullYear()),"-",e(b.getUTCMonth()+1,2),"-",e(b.getUTCDate(),2),"T",e(b.getUTCHours(),2),":",e(b.getUTCMinutes(),2),":",e(b.getUTCSeconds(),
2),".",e(b.getUTCMilliseconds(),3),"-",'00:00"'],0))):b instanceof RegExp?xh.d(c,Kc(['#"',b.source,'"'],0)):(b?b.j&2147483648||b.I||(b.j?0:w(Mb,b)):w(Mb,b))?Nb(b,c,d):xh.d(c,Kc(["#\x3c",""+z(b),"\x3e"],0))},Ch=function(){function a(a){var d=null;if(0<arguments.length){for(var d=0,e=Array(arguments.length-0);d<e.length;)e[d]=arguments[d+0],++d;d=new F(e,0)}return b.call(this,d)}function b(a){var b=oa();if(Yc(a))b="";else{var e=z,f=new fa;a:{var g=new dc(f);$(G(a),g,b);a=D(K(a));for(var h=null,l=0,
m=0;;)if(m<l){var p=h.Q(null,m);Lb(g," ");$(p,g,b);m+=1}else if(a=D(a))h=a,fd(h)?(a=Yb(h),l=Zb(h),h=a,p=Q(a),a=l,l=p):(p=G(h),Lb(g," "),$(p,g,b),a=K(h),h=null,l=0),m=0;else break a}b=""+e(f)}return b}a.i=0;a.f=function(a){a=D(a);return b(a)};a.d=b;return a}();function Bh(a,b,c,d){return wh(c,function(a,c,d){var h=hb(a);b.c?b.c(h,c,d):b.call(null,h,c,d);Lb(c," ");a=ib(a);return b.c?b.c(a,c,d):b.call(null,a,c,d)},"{",", ","}",d,D(a))}Me.prototype.I=!0;
Me.prototype.v=function(a,b,c){Lb(b,"#\x3cVolatile: ");$(this.state,b,c);return Lb(b,"\x3e")};F.prototype.I=!0;F.prototype.v=function(a,b,c){return wh(b,$,"("," ",")",c,this)};V.prototype.I=!0;V.prototype.v=function(a,b,c){return wh(b,$,"("," ",")",c,this)};wg.prototype.I=!0;wg.prototype.v=function(a,b,c){return wh(b,$,"("," ",")",c,this)};pg.prototype.I=!0;pg.prototype.v=function(a,b,c){return wh(b,$,"("," ",")",c,this)};Z.prototype.I=!0;
Z.prototype.v=function(a,b,c){return wh(b,$,"["," ","]",c,this)};Rf.prototype.I=!0;Rf.prototype.v=function(a,b,c){return wh(b,$,"("," ",")",c,this)};ch.prototype.I=!0;ch.prototype.v=function(a,b,c){return wh(b,$,"#{"," ","}",c,this)};Bf.prototype.I=!0;Bf.prototype.v=function(a,b,c){return wh(b,$,"("," ",")",c,this)};Ld.prototype.I=!0;Ld.prototype.v=function(a,b,c){return wh(b,$,"("," ",")",c,this)};Hc.prototype.I=!0;Hc.prototype.v=function(a,b,c){return wh(b,$,"("," ",")",c,this)};
rg.prototype.I=!0;rg.prototype.v=function(a,b,c){return Bh(this,$,b,c)};qg.prototype.I=!0;qg.prototype.v=function(a,b,c){return wh(b,$,"("," ",")",c,this)};Df.prototype.I=!0;Df.prototype.v=function(a,b,c){return wh(b,$,"["," ","]",c,this)};Lg.prototype.I=!0;Lg.prototype.v=function(a,b,c){return Bh(this,$,b,c)};$g.prototype.I=!0;$g.prototype.v=function(a,b,c){return wh(b,$,"#{"," ","}",c,this)};Vd.prototype.I=!0;Vd.prototype.v=function(a,b,c){return wh(b,$,"("," ",")",c,this)};Ug.prototype.I=!0;
Ug.prototype.v=function(a,b,c){return wh(b,$,"("," ",")",c,this)};X.prototype.I=!0;X.prototype.v=function(a,b,c){return wh(b,$,"["," ","]",c,this)};W.prototype.I=!0;W.prototype.v=function(a,b,c){return wh(b,$,"["," ","]",c,this)};Kf.prototype.I=!0;Kf.prototype.v=function(a,b,c){return wh(b,$,"("," ",")",c,this)};Hd.prototype.I=!0;Hd.prototype.v=function(a,b){return Lb(b,"()")};ze.prototype.I=!0;ze.prototype.v=function(a,b,c){return wh(b,$,"("," ",")",c,this)};Lf.prototype.I=!0;
Lf.prototype.v=function(a,b,c){return wh(b,$,"#queue ["," ","]",c,D(this))};pa.prototype.I=!0;pa.prototype.v=function(a,b,c){return Bh(this,$,b,c)};ph.prototype.I=!0;ph.prototype.v=function(a,b,c){return wh(b,$,"("," ",")",c,this)};Sg.prototype.I=!0;Sg.prototype.v=function(a,b,c){return wh(b,$,"("," ",")",c,this)};Fd.prototype.I=!0;Fd.prototype.v=function(a,b,c){return wh(b,$,"("," ",")",c,this)};W.prototype.sb=!0;W.prototype.tb=function(a,b){return pd.a(this,b)};Df.prototype.sb=!0;
Df.prototype.tb=function(a,b){return pd.a(this,b)};U.prototype.sb=!0;U.prototype.tb=function(a,b){return Md(this,b)};qc.prototype.sb=!0;qc.prototype.tb=function(a,b){return pc(this,b)};var Dh=function(){function a(a,d,e){var f=null;if(2<arguments.length){for(var f=0,g=Array(arguments.length-2);f<g.length;)g[f]=arguments[f+2],++f;f=new F(g,0)}return b.call(this,a,d,f)}function b(a,b,e){return a.k=T.c(b,a.k,e)}a.i=2;a.f=function(a){var d=G(a);a=K(a);var e=G(a);a=H(a);return b(d,e,a)};a.d=b;return a}();
function Eh(a){return function(b,c){var d=a.a?a.a(b,c):a.call(null,b,c);return Ac(d)?new yc(d):d}}
function Ve(a){return function(b){return function(){function c(a,c){return A.c(b,a,c)}function d(b){return a.b?a.b(b):a.call(null,b)}function e(){return a.l?a.l():a.call(null)}var f=null,f=function(a,b){switch(arguments.length){case 0:return e.call(this);case 1:return d.call(this,a);case 2:return c.call(this,a,b)}throw Error("Invalid arity: "+arguments.length);};f.l=e;f.b=d;f.a=c;return f}()}(Eh(a))}
var Fh=function(){function a(a){return Ce.a(c.l(),a)}function b(){return function(a){return function(b){return function(){function c(f,g){var h=L.b?L.b(b):L.call(null,b);ac(b,g);return sc.a(h,g)?f:a.a?a.a(f,g):a.call(null,f,g)}function g(b){return a.b?a.b(b):a.call(null,b)}function h(){return a.l?a.l():a.call(null)}var l=null,l=function(a,b){switch(arguments.length){case 0:return h.call(this);case 1:return g.call(this,a);case 2:return c.call(this,a,b)}throw Error("Invalid arity: "+arguments.length);
};l.l=h;l.b=g;l.a=c;return l}()}(new Me(sh))}}var c=null,c=function(c){switch(arguments.length){case 0:return b.call(this);case 1:return a.call(this,c)}throw Error("Invalid arity: "+arguments.length);};c.l=b;c.b=a;return c}();function Gh(a,b){this.fa=a;this.Zb=b;this.q=0;this.j=2173173760}Gh.prototype.v=function(a,b,c){return wh(b,$,"("," ",")",c,this)};Gh.prototype.O=function(a,b,c){return wd.n(this.fa,b,c,this.Zb)};Gh.prototype.D=function(){return D(Ce.a(this.fa,this.Zb))};Gh.prototype[Ea]=function(){return uc(this)};
var Hh={};function Ih(a){if(a?a.gc:a)return a.gc(a);var b;b=Ih[n(null==a?null:a)];if(!b&&(b=Ih._,!b))throw x("IEncodeJS.-clj-\x3ejs",a);return b.call(null,a)}function Jh(a){return(a?t(t(null)?null:a.fc)||(a.yb?0:w(Hh,a)):w(Hh,a))?Ih(a):"string"===typeof a||"number"===typeof a||a instanceof U||a instanceof qc?Kh.b?Kh.b(a):Kh.call(null,a):Ch.d(Kc([a],0))}
var Kh=function Lh(b){if(null==b)return null;if(b?t(t(null)?null:b.fc)||(b.yb?0:w(Hh,b)):w(Hh,b))return Ih(b);if(b instanceof U)return Od(b);if(b instanceof qc)return""+z(b);if(dd(b)){var c={};b=D(b);for(var d=null,e=0,f=0;;)if(f<e){var g=d.Q(null,f),h=R.c(g,0,null),g=R.c(g,1,null);c[Jh(h)]=Lh(g);f+=1}else if(b=D(b))fd(b)?(e=Yb(b),b=Zb(b),d=e,e=Q(e)):(e=G(b),d=R.c(e,0,null),e=R.c(e,1,null),c[Jh(d)]=Lh(e),b=K(b),d=null,e=0),f=0;else break;return c}if($c(b)){c=[];b=D(Oe.a(Lh,b));d=null;for(f=e=0;;)if(f<
e)h=d.Q(null,f),c.push(h),f+=1;else if(b=D(b))d=b,fd(d)?(b=Yb(d),f=Zb(d),d=b,e=Q(b),b=f):(b=G(d),c.push(b),b=K(d),d=null,e=0),f=0;else break;return c}return b},Mh={};function Nh(a,b){if(a?a.ec:a)return a.ec(a,b);var c;c=Nh[n(null==a?null:a)];if(!c&&(c=Nh._,!c))throw x("IEncodeClojure.-js-\x3eclj",a);return c.call(null,a,b)}
var Ph=function(){function a(a){return b.d(a,Kc([new pa(null,1,[Oh,!1],null)],0))}var b=null,c=function(){function a(c,d){var h=null;if(1<arguments.length){for(var h=0,l=Array(arguments.length-1);h<l.length;)l[h]=arguments[h+1],++h;h=new F(l,0)}return b.call(this,c,h)}function b(a,c){var d=kd(c)?T.a(Og,c):c,e=S.a(d,Oh);return function(a,b,d,e){return function v(f){return(f?t(t(null)?null:f.uc)||(f.yb?0:w(Mh,f)):w(Mh,f))?Nh(f,T.a(Pg,c)):kd(f)?vh.b(Oe.a(v,f)):$c(f)?af.a(Oc(f),Oe.a(v,f)):f instanceof
Array?zf(Oe.a(v,f)):Ba(f)===Object?af.a(Uf,function(){return function(a,b,c,d){return function Pa(e){return new V(null,function(a,b,c,d){return function(){for(;;){var a=D(e);if(a){if(fd(a)){var b=Yb(a),c=Q(b),g=Td(c);return function(){for(var a=0;;)if(a<c){var e=C.a(b,a),h=g,l=uf,m;m=e;m=d.b?d.b(m):d.call(null,m);e=new W(null,2,5,l,[m,v(f[e])],null);h.add(e);a+=1}else return!0}()?Wd(g.ca(),Pa(Zb(a))):Wd(g.ca(),null)}var h=G(a);return M(new W(null,2,5,uf,[function(){var a=h;return d.b?d.b(a):d.call(null,
a)}(),v(f[h])],null),Pa(H(a)))}return null}}}(a,b,c,d),null,null)}}(a,b,d,e)(gd(f))}()):f}}(c,d,e,t(e)?Pd:z)(a)}a.i=1;a.f=function(a){var c=G(a);a=H(a);return b(c,a)};a.d=b;return a}(),b=function(b,e){switch(arguments.length){case 1:return a.call(this,b);default:var f=null;if(1<arguments.length){for(var f=0,g=Array(arguments.length-1);f<g.length;)g[f]=arguments[f+1],++f;f=new F(g,0)}return c.d(b,f)}throw Error("Invalid arity: "+arguments.length);};b.i=1;b.f=c.f;b.b=a;b.d=c.d;return b}();var wa=new U(null,"meta","meta",1499536964),ya=new U(null,"dup","dup",556298533),sh=new U("cljs.core","none","cljs.core/none",926646439),pe=new U(null,"file","file",-1269645878),le=new U(null,"end-column","end-column",1425389514),sa=new U(null,"flush-on-newline","flush-on-newline",-151457939),ne=new U(null,"column","column",2078222095),ua=new U(null,"readably","readably",1129599760),oe=new U(null,"line","line",212345235),za=new U(null,"print-length","print-length",1931866356),me=new U(null,"end-line",
"end-line",1837326455),Oh=new U(null,"keywordize-keys","keywordize-keys",1310784252),Zg=new U("cljs.core","not-found","cljs.core/not-found",-1572889185);function Qh(a,b){var c=T.c(ih,a,b);return M(c,Ye.a(function(a){return function(b){return a===b}}(c),b))}
var Rh=function(){function a(a,b){return Q(a)<Q(b)?A.c(Nc,b,a):A.c(Nc,a,b)}var b=null,c=function(){function a(c,d,h){var l=null;if(2<arguments.length){for(var l=0,m=Array(arguments.length-2);l<m.length;)m[l]=arguments[l+2],++l;l=new F(m,0)}return b.call(this,c,d,l)}function b(a,c,d){a=Qh(Q,Nc.d(d,c,Kc([a],0)));return A.c(af,G(a),H(a))}a.i=2;a.f=function(a){var c=G(a);a=K(a);var d=G(a);a=H(a);return b(c,d,a)};a.d=b;return a}(),b=function(b,e,f){switch(arguments.length){case 0:return bh;case 1:return b;
case 2:return a.call(this,b,e);default:var g=null;if(2<arguments.length){for(var g=0,h=Array(arguments.length-2);g<h.length;)h[g]=arguments[g+2],++g;g=new F(h,0)}return c.d(b,e,g)}throw Error("Invalid arity: "+arguments.length);};b.i=2;b.f=c.f;b.l=function(){return bh};b.b=function(a){return a};b.a=a;b.d=c.d;return b}(),Sh=function(){function a(a,b){for(;;)if(Q(b)<Q(a)){var c=a;a=b;b=c}else return A.c(function(a,b){return function(a,c){return nd(b,c)?a:Xc.a(a,c)}}(a,b),a,a)}var b=null,c=function(){function a(b,
d,h){var l=null;if(2<arguments.length){for(var l=0,m=Array(arguments.length-2);l<m.length;)m[l]=arguments[l+2],++l;l=new F(m,0)}return c.call(this,b,d,l)}function c(a,d,e){a=Qh(function(a){return-Q(a)},Nc.d(e,d,Kc([a],0)));return A.c(b,G(a),H(a))}a.i=2;a.f=function(a){var b=G(a);a=K(a);var d=G(a);a=H(a);return c(b,d,a)};a.d=c;return a}(),b=function(b,e,f){switch(arguments.length){case 1:return b;case 2:return a.call(this,b,e);default:var g=null;if(2<arguments.length){for(var g=0,h=Array(arguments.length-
2);g<h.length;)h[g]=arguments[g+2],++g;g=new F(h,0)}return c.d(b,e,g)}throw Error("Invalid arity: "+arguments.length);};b.i=2;b.f=c.f;b.b=function(a){return a};b.a=a;b.d=c.d;return b}(),Th=function(){function a(a,b){return Q(a)<Q(b)?A.c(function(a,c){return nd(b,c)?Xc.a(a,c):a},a,a):A.c(Xc,a,b)}var b=null,c=function(){function a(b,d,h){var l=null;if(2<arguments.length){for(var l=0,m=Array(arguments.length-2);l<m.length;)m[l]=arguments[l+2],++l;l=new F(m,0)}return c.call(this,b,d,l)}function c(a,d,
e){return A.c(b,a,Nc.a(e,d))}a.i=2;a.f=function(a){var b=G(a);a=K(a);var d=G(a);a=H(a);return c(b,d,a)};a.d=c;return a}(),b=function(b,e,f){switch(arguments.length){case 1:return b;case 2:return a.call(this,b,e);default:var g=null;if(2<arguments.length){for(var g=0,h=Array(arguments.length-2);g<h.length;)h[g]=arguments[g+2],++g;g=new F(h,0)}return c.d(b,e,g)}throw Error("Invalid arity: "+arguments.length);};b.i=2;b.f=c.f;b.b=function(a){return a};b.a=a;b.d=c.d;return b}();
function Uh(a,b){return A.c(function(b,d){var e=R.c(d,0,null),f=R.c(d,1,null);return nd(a,e)?Rc.c(b,f,S.a(a,e)):b},T.c(Sc,a,Tg(b)),b)}function Vh(a,b){return A.c(function(a,d){var e=Yg(d,b);return Rc.c(a,e,Nc.a(S.c(a,e,bh),d))},Uf,a)}function Wh(a){return A.c(function(a,c){var d=R.c(c,0,null),e=R.c(c,1,null);return Rc.c(a,e,d)},Uf,a)}
var Xh=function(){function a(a,b,c){a=Q(a)<=Q(b)?new W(null,3,5,uf,[a,b,Wh(c)],null):new W(null,3,5,uf,[b,a,c],null);b=R.c(a,0,null);c=R.c(a,1,null);var g=R.c(a,2,null),h=Vh(b,Vg(g));return A.c(function(a,b,c,d,e){return function(f,g){var h=function(){var a=Uh(Yg(g,Tg(d)),d);return e.b?e.b(a):e.call(null,a)}();return t(h)?A.c(function(){return function(a,b){return Nc.a(a,Wg.d(Kc([b,g],0)))}}(h,a,b,c,d,e),f,h):f}}(a,b,c,g,h),bh,c)}function b(a,b){if(D(a)&&D(b)){var c=Sh.a(fh(Tg(G(a))),fh(Tg(G(b)))),
g=Q(a)<=Q(b)?new W(null,2,5,uf,[a,b],null):new W(null,2,5,uf,[b,a],null),h=R.c(g,0,null),l=R.c(g,1,null),m=Vh(h,c);return A.c(function(a,b,c,d,e){return function(f,g){var h=function(){var b=Yg(g,a);return e.b?e.b(b):e.call(null,b)}();return t(h)?A.c(function(){return function(a,b){return Nc.a(a,Wg.d(Kc([b,g],0)))}}(h,a,b,c,d,e),f,h):f}}(c,g,h,l,m),bh,l)}return bh}var c=null,c=function(c,e,f){switch(arguments.length){case 2:return b.call(this,c,e);case 3:return a.call(this,c,e,f)}throw Error("Invalid arity: "+
arguments.length);};c.a=b;c.c=a;return c}();r("mori.apply",T);r("mori.apply.f2",T.a);r("mori.apply.f3",T.c);r("mori.apply.f4",T.n);r("mori.apply.f5",T.r);r("mori.apply.fn",T.K);r("mori.count",Q);r("mori.distinct",function(a){return function c(a,e){return new V(null,function(){return function(a,d){for(;;){var e=a,l=R.c(e,0,null);if(e=D(e))if(nd(d,l))l=H(e),e=d,a=l,d=e;else return M(l,c(H(e),Nc.a(d,l)));else return null}}.call(null,a,e)},null,null)}(a,bh)});r("mori.empty",Oc);r("mori.first",G);r("mori.second",Lc);r("mori.next",K);
r("mori.rest",H);r("mori.seq",D);r("mori.conj",Nc);r("mori.conj.f0",Nc.l);r("mori.conj.f1",Nc.b);r("mori.conj.f2",Nc.a);r("mori.conj.fn",Nc.K);r("mori.cons",M);r("mori.find",function(a,b){return null!=a&&bd(a)&&nd(a,b)?new W(null,2,5,uf,[b,S.a(a,b)],null):null});r("mori.nth",R);r("mori.nth.f2",R.a);r("mori.nth.f3",R.c);r("mori.last",function(a){for(;;){var b=K(a);if(null!=b)a=b;else return G(a)}});r("mori.assoc",Rc);r("mori.assoc.f3",Rc.c);r("mori.assoc.fn",Rc.K);r("mori.dissoc",Sc);
r("mori.dissoc.f1",Sc.b);r("mori.dissoc.f2",Sc.a);r("mori.dissoc.fn",Sc.K);r("mori.getIn",cf);r("mori.getIn.f2",cf.a);r("mori.getIn.f3",cf.c);r("mori.updateIn",df);r("mori.updateIn.f3",df.c);r("mori.updateIn.f4",df.n);r("mori.updateIn.f5",df.r);r("mori.updateIn.f6",df.P);r("mori.updateIn.fn",df.K);r("mori.assocIn",function Yh(b,c,d){var e=R.c(c,0,null);return(c=Ed(c))?Rc.c(b,e,Yh(S.a(b,e),c,d)):Rc.c(b,e,d)});r("mori.fnil",Ke);r("mori.fnil.f2",Ke.a);r("mori.fnil.f3",Ke.c);r("mori.fnil.f4",Ke.n);
r("mori.disj",Xc);r("mori.disj.f1",Xc.b);r("mori.disj.f2",Xc.a);r("mori.disj.fn",Xc.K);r("mori.pop",function(a){return null==a?null:mb(a)});r("mori.peek",Wc);r("mori.hash",nc);r("mori.get",S);r("mori.get.f2",S.a);r("mori.get.f3",S.c);r("mori.hasKey",nd);r("mori.isEmpty",Yc);r("mori.reverse",Jd);r("mori.take",Pe);r("mori.take.f1",Pe.b);r("mori.take.f2",Pe.a);r("mori.drop",Qe);r("mori.drop.f1",Qe.b);r("mori.drop.f2",Qe.a);r("mori.takeNth",rh);r("mori.takeNth.f1",rh.b);r("mori.takeNth.f2",rh.a);
r("mori.partition",bf);r("mori.partition.f2",bf.a);r("mori.partition.f3",bf.c);r("mori.partition.f4",bf.n);r("mori.partitionAll",kh);r("mori.partitionAll.f1",kh.b);r("mori.partitionAll.f2",kh.a);r("mori.partitionAll.f3",kh.c);r("mori.partitionBy",th);r("mori.partitionBy.f1",th.b);r("mori.partitionBy.f2",th.a);r("mori.iterate",function Zh(b,c){return M(c,new V(null,function(){return Zh(b,b.b?b.b(c):b.call(null,c))},null,null))});r("mori.into",af);r("mori.into.f2",af.a);r("mori.into.f3",af.c);
r("mori.merge",Wg);r("mori.mergeWith",Xg);r("mori.subvec",Cf);r("mori.subvec.f2",Cf.a);r("mori.subvec.f3",Cf.c);r("mori.takeWhile",lh);r("mori.takeWhile.f1",lh.b);r("mori.takeWhile.f2",lh.a);r("mori.dropWhile",Re);r("mori.dropWhile.f1",Re.b);r("mori.dropWhile.f2",Re.a);r("mori.groupBy",function(a,b){return ce(A.c(function(b,d){var e=a.b?a.b(d):a.call(null,d);return ee.c(b,e,Nc.a(S.c(b,e,Mc),d))},Ob(Uf),b))});r("mori.interpose",function(a,b){return Qe.a(1,Ue.a(Se.b(a),b))});r("mori.interleave",Ue);
r("mori.interleave.f2",Ue.a);r("mori.interleave.fn",Ue.K);r("mori.concat",ae);r("mori.concat.f0",ae.l);r("mori.concat.f1",ae.b);r("mori.concat.f2",ae.a);r("mori.concat.fn",ae.K);function $e(a){return a instanceof Array||cd(a)}r("mori.flatten",function(a){return Xe.a(function(a){return!$e(a)},H(Ze(a)))});r("mori.lazySeq",function(a){return new V(null,a,null,null)});r("mori.keys",Tg);r("mori.selectKeys",Yg);r("mori.vals",Vg);r("mori.primSeq",Jc);r("mori.primSeq.f1",Jc.b);r("mori.primSeq.f2",Jc.a);
r("mori.map",Oe);r("mori.map.f1",Oe.b);r("mori.map.f2",Oe.a);r("mori.map.f3",Oe.c);r("mori.map.f4",Oe.n);r("mori.map.fn",Oe.K);
r("mori.mapIndexed",function(a,b){return function d(b,f){return new V(null,function(){var g=D(f);if(g){if(fd(g)){for(var h=Yb(g),l=Q(h),m=Td(l),p=0;;)if(p<l)Xd(m,function(){var d=b+p,f=C.a(h,p);return a.a?a.a(d,f):a.call(null,d,f)}()),p+=1;else break;return Wd(m.ca(),d(b+l,Zb(g)))}return M(function(){var d=G(g);return a.a?a.a(b,d):a.call(null,b,d)}(),d(b+1,H(g)))}return null},null,null)}(0,b)});r("mori.mapcat",We);r("mori.mapcat.f1",We.b);r("mori.mapcat.fn",We.K);r("mori.reduce",A);
r("mori.reduce.f2",A.a);r("mori.reduce.f3",A.c);r("mori.reduceKV",function(a,b,c){return null!=c?xb(c,a,b):b});r("mori.keep",Le);r("mori.keep.f1",Le.b);r("mori.keep.f2",Le.a);r("mori.keepIndexed",Ne);r("mori.keepIndexed.f1",Ne.b);r("mori.keepIndexed.f2",Ne.a);r("mori.filter",Xe);r("mori.filter.f1",Xe.b);r("mori.filter.f2",Xe.a);r("mori.remove",Ye);r("mori.remove.f1",Ye.b);r("mori.remove.f2",Ye.a);r("mori.some",Fe);r("mori.every",Ee);r("mori.equals",sc);r("mori.equals.f1",sc.b);
r("mori.equals.f2",sc.a);r("mori.equals.fn",sc.K);r("mori.range",qh);r("mori.range.f0",qh.l);r("mori.range.f1",qh.b);r("mori.range.f2",qh.a);r("mori.range.f3",qh.c);r("mori.repeat",Se);r("mori.repeat.f1",Se.b);r("mori.repeat.f2",Se.a);r("mori.repeatedly",Te);r("mori.repeatedly.f1",Te.b);r("mori.repeatedly.f2",Te.a);r("mori.sort",sd);r("mori.sort.f1",sd.b);r("mori.sort.f2",sd.a);r("mori.sortBy",td);r("mori.sortBy.f2",td.a);r("mori.sortBy.f3",td.c);r("mori.intoArray",Ia);r("mori.intoArray.f1",Ia.b);
r("mori.intoArray.f2",Ia.a);r("mori.subseq",nh);r("mori.subseq.f3",nh.c);r("mori.subseq.f5",nh.r);r("mori.dedupe",Fh);r("mori.dedupe.f0",Fh.l);r("mori.dedupe.f1",Fh.b);r("mori.transduce",wd);r("mori.transduce.f3",wd.c);r("mori.transduce.f4",wd.n);r("mori.eduction",function(a,b){return new Gh(a,b)});r("mori.sequence",Ce);r("mori.sequence.f1",Ce.b);r("mori.sequence.f2",Ce.a);r("mori.sequence.fn",Ce.K);r("mori.completing",vd);r("mori.completing.f1",vd.b);r("mori.completing.f2",vd.a);r("mori.list",Kd);
r("mori.vector",Af);r("mori.hashMap",Pg);r("mori.set",fh);r("mori.sortedSet",gh);r("mori.sortedSetBy",hh);r("mori.sortedMap",Qg);r("mori.sortedMapBy",Rg);r("mori.queue",function(){function a(a){var d=null;if(0<arguments.length){for(var d=0,e=Array(arguments.length-0);d<e.length;)e[d]=arguments[d+0],++d;d=new F(e,0)}return b.call(this,d)}function b(a){return af.a?af.a(Mf,a):af.call(null,Mf,a)}a.i=0;a.f=function(a){a=D(a);return b(a)};a.d=b;return a}());r("mori.keyword",Pd);r("mori.keyword.f1",Pd.b);
r("mori.keyword.f2",Pd.a);r("mori.symbol",rc);r("mori.symbol.f1",rc.b);r("mori.symbol.f2",rc.a);r("mori.zipmap",function(a,b){for(var c=Ob(Uf),d=D(a),e=D(b);;)if(d&&e)c=ee.c(c,G(d),G(e)),d=K(d),e=K(e);else return Qb(c)});r("mori.isList",function(a){return a?a.j&33554432||a.wc?!0:a.j?!1:w(Eb,a):w(Eb,a)});r("mori.isSeq",kd);r("mori.isVector",ed);r("mori.isMap",dd);r("mori.isSet",ad);r("mori.isKeyword",function(a){return a instanceof U});r("mori.isSymbol",function(a){return a instanceof qc});
r("mori.isCollection",$c);r("mori.isSequential",cd);r("mori.isAssociative",bd);r("mori.isCounted",Ec);r("mori.isIndexed",Fc);r("mori.isReduceable",function(a){return a?a.j&524288||a.Sb?!0:a.j?!1:w(vb,a):w(vb,a)});r("mori.isSeqable",ld);r("mori.isReversible",Id);r("mori.union",Rh);r("mori.union.f0",Rh.l);r("mori.union.f1",Rh.b);r("mori.union.f2",Rh.a);r("mori.union.fn",Rh.K);r("mori.intersection",Sh);r("mori.intersection.f1",Sh.b);r("mori.intersection.f2",Sh.a);r("mori.intersection.fn",Sh.K);
r("mori.difference",Th);r("mori.difference.f1",Th.b);r("mori.difference.f2",Th.a);r("mori.difference.fn",Th.K);r("mori.join",Xh);r("mori.join.f2",Xh.a);r("mori.join.f3",Xh.c);r("mori.index",Vh);r("mori.project",function(a,b){return fh(Oe.a(function(a){return Yg(a,b)},a))});r("mori.mapInvert",Wh);r("mori.rename",function(a,b){return fh(Oe.a(function(a){return Uh(a,b)},a))});r("mori.renameKeys",Uh);r("mori.isSubset",function(a,b){return Q(a)<=Q(b)&&Ee(function(a){return nd(b,a)},a)});
r("mori.isSuperset",function(a,b){return Q(a)>=Q(b)&&Ee(function(b){return nd(a,b)},b)});r("mori.notEquals",je);r("mori.notEquals.f1",je.b);r("mori.notEquals.f2",je.a);r("mori.notEquals.fn",je.K);r("mori.gt",Ad);r("mori.gt.f1",Ad.b);r("mori.gt.f2",Ad.a);r("mori.gt.fn",Ad.K);r("mori.gte",Bd);r("mori.gte.f1",Bd.b);r("mori.gte.f2",Bd.a);r("mori.gte.fn",Bd.K);r("mori.lt",yd);r("mori.lt.f1",yd.b);r("mori.lt.f2",yd.a);r("mori.lt.fn",yd.K);r("mori.lte",zd);r("mori.lte.f1",zd.b);r("mori.lte.f2",zd.a);
r("mori.lte.fn",zd.K);r("mori.compare",od);r("mori.partial",Je);r("mori.partial.f1",Je.b);r("mori.partial.f2",Je.a);r("mori.partial.f3",Je.c);r("mori.partial.f4",Je.n);r("mori.partial.fn",Je.K);r("mori.comp",Ie);r("mori.comp.f0",Ie.l);r("mori.comp.f1",Ie.b);r("mori.comp.f2",Ie.a);r("mori.comp.f3",Ie.c);r("mori.comp.fn",Ie.K);
r("mori.pipeline",function(){function a(a){var d=null;if(0<arguments.length){for(var d=0,e=Array(arguments.length-0);d<e.length;)e[d]=arguments[d+0],++d;d=new F(e,0)}return b.call(this,d)}function b(a){function b(a,c){return c.b?c.b(a):c.call(null,a)}return A.a?A.a(b,a):A.call(null,b,a)}a.i=0;a.f=function(a){a=D(a);return b(a)};a.d=b;return a}());
r("mori.curry",function(){function a(a,d){var e=null;if(1<arguments.length){for(var e=0,f=Array(arguments.length-1);e<f.length;)f[e]=arguments[e+1],++e;e=new F(f,0)}return b.call(this,a,e)}function b(a,b){return function(e){return T.a(a,M.a?M.a(e,b):M.call(null,e,b))}}a.i=1;a.f=function(a){var d=G(a);a=H(a);return b(d,a)};a.d=b;return a}());
r("mori.juxt",function(){function a(a){var d=null;if(0<arguments.length){for(var d=0,e=Array(arguments.length-0);d<e.length;)e[d]=arguments[d+0],++d;d=new F(e,0)}return b.call(this,d)}function b(a){return function(){function b(a){var c=null;if(0<arguments.length){for(var c=0,d=Array(arguments.length-0);c<d.length;)d[c]=arguments[c+0],++c;c=new F(d,0)}return e.call(this,c)}function e(b){var d=function(){function d(a){return T.a(a,b)}return Oe.a?Oe.a(d,a):Oe.call(null,d,a)}();return Ia.b?Ia.b(d):Ia.call(null,
d)}b.i=0;b.f=function(a){a=D(a);return e(a)};b.d=e;return b}()}a.i=0;a.f=function(a){a=D(a);return b(a)};a.d=b;return a}());
r("mori.knit",function(){function a(a){var d=null;if(0<arguments.length){for(var d=0,e=Array(arguments.length-0);d<e.length;)e[d]=arguments[d+0],++d;d=new F(e,0)}return b.call(this,d)}function b(a){return function(b){var e=function(){function e(a,b){return a.b?a.b(b):a.call(null,b)}return Oe.c?Oe.c(e,a,b):Oe.call(null,e,a,b)}();return Ia.b?Ia.b(e):Ia.call(null,e)}}a.i=0;a.f=function(a){a=D(a);return b(a)};a.d=b;return a}());r("mori.sum",xd);r("mori.sum.f0",xd.l);r("mori.sum.f1",xd.b);
r("mori.sum.f2",xd.a);r("mori.sum.fn",xd.K);r("mori.inc",function(a){return a+1});r("mori.dec",function(a){return a-1});r("mori.isEven",Ge);r("mori.isOdd",function(a){return!Ge(a)});r("mori.each",function(a,b){for(var c=D(a),d=null,e=0,f=0;;)if(f<e){var g=d.Q(null,f);b.b?b.b(g):b.call(null,g);f+=1}else if(c=D(c))fd(c)?(e=Yb(c),c=Zb(c),d=e,e=Q(e)):(d=g=G(c),b.b?b.b(d):b.call(null,d),c=K(c),d=null,e=0),f=0;else return null});r("mori.identity",ud);
r("mori.constantly",function(a){return function(){function b(b){if(0<arguments.length)for(var d=0,e=Array(arguments.length-0);d<e.length;)e[d]=arguments[d+0],++d;return a}b.i=0;b.f=function(b){D(b);return a};b.d=function(){return a};return b}()});r("mori.toJs",Kh);
r("mori.toClj",function(){function a(a,b){return Ph.d(a,Kc([Oh,b],0))}function b(a){return Ph.b(a)}var c=null,c=function(c,e){switch(arguments.length){case 1:return b.call(this,c);case 2:return a.call(this,c,e)}throw Error("Invalid arity: "+arguments.length);};c.b=b;c.a=a;return c}());r("mori.configure",function(a,b){switch(a){case "print-length":return la=b;case "print-level":return ma=b;default:throw Error([z("No matching clause: "),z(a)].join(""));}});r("mori.meta",Vc);r("mori.withMeta",O);
r("mori.varyMeta",ie);r("mori.varyMeta.f2",ie.a);r("mori.varyMeta.f3",ie.c);r("mori.varyMeta.f4",ie.n);r("mori.varyMeta.f5",ie.r);r("mori.varyMeta.f6",ie.P);r("mori.varyMeta.fn",ie.K);r("mori.alterMeta",Dh);r("mori.resetMeta",function(a,b){return a.k=b});V.prototype.inspect=function(){return this.toString()};F.prototype.inspect=function(){return this.toString()};Hc.prototype.inspect=function(){return this.toString()};wg.prototype.inspect=function(){return this.toString()};pg.prototype.inspect=function(){return this.toString()};
qg.prototype.inspect=function(){return this.toString()};Fd.prototype.inspect=function(){return this.toString()};Ld.prototype.inspect=function(){return this.toString()};Hd.prototype.inspect=function(){return this.toString()};W.prototype.inspect=function(){return this.toString()};Vd.prototype.inspect=function(){return this.toString()};Bf.prototype.inspect=function(){return this.toString()};Df.prototype.inspect=function(){return this.toString()};Z.prototype.inspect=function(){return this.toString()};
X.prototype.inspect=function(){return this.toString()};pa.prototype.inspect=function(){return this.toString()};rg.prototype.inspect=function(){return this.toString()};Lg.prototype.inspect=function(){return this.toString()};$g.prototype.inspect=function(){return this.toString()};ch.prototype.inspect=function(){return this.toString()};ph.prototype.inspect=function(){return this.toString()};U.prototype.inspect=function(){return this.toString()};qc.prototype.inspect=function(){return this.toString()};
Lf.prototype.inspect=function(){return this.toString()};Kf.prototype.inspect=function(){return this.toString()};r("mori.mutable.thaw",function(a){return Ob(a)});r("mori.mutable.freeze",ce);r("mori.mutable.conj",de);r("mori.mutable.conj.f0",de.l);r("mori.mutable.conj.f1",de.b);r("mori.mutable.conj.f2",de.a);r("mori.mutable.conj.fn",de.K);r("mori.mutable.assoc",ee);r("mori.mutable.assoc.f3",ee.c);r("mori.mutable.assoc.fn",ee.K);r("mori.mutable.dissoc",fe);r("mori.mutable.dissoc.f2",fe.a);r("mori.mutable.dissoc.fn",fe.K);r("mori.mutable.pop",function(a){return Ub(a)});r("mori.mutable.disj",ge);
r("mori.mutable.disj.f2",ge.a);r("mori.mutable.disj.fn",ge.K);;return this.mori;}.call({});});

},{}],27:[function(require,module,exports){
var tape = require('tape')

exports = module.exports = tape

// Maintain tape@1 compatibility
exports.Test.prototype._end = (
  exports.Test.prototype._end ||
  exports.Test.prototype.end
)

exports.Test.prototype.run = function () {
  if (!this._cb || this._skip) {
    return this._end()
  }
  this.emit('prerun')
  try {
    this._cb(this)
  }
  catch (err) {
    this.error(err)
    this._end()
    return
  }
  this.emit('run') 
}

},{"tape":28}],28:[function(require,module,exports){
(function (process){
var defined = require('defined');
var createDefaultStream = require('./lib/default_stream');
var Test = require('./lib/test');
var createResult = require('./lib/results');
var through = require('through');

var canEmitExit = typeof process !== 'undefined' && process
    && typeof process.on === 'function' && process.browser !== true
;
var canExit = typeof process !== 'undefined' && process
    && typeof process.exit === 'function'
;

var nextTick = typeof setImmediate !== 'undefined'
    ? setImmediate
    : process.nextTick
;

exports = module.exports = (function () {
    var harness;
    var lazyLoad = function () {
        return getHarness().apply(this, arguments);
    };
    
    lazyLoad.only = function () {
        return getHarness().only.apply(this, arguments);
    };
    
    lazyLoad.createStream = function (opts) {
        if (!opts) opts = {};
        if (!harness) {
            var output = through();
            getHarness({ stream: output, objectMode: opts.objectMode });
            return output;
        }
        return harness.createStream(opts);
    };
    
    return lazyLoad
    
    function getHarness (opts) {
        if (!opts) opts = {};
        opts.autoclose = !canEmitExit;
        if (!harness) harness = createExitHarness(opts);
        return harness;
    }
})();

function createExitHarness (conf) {
    if (!conf) conf = {};
    var harness = createHarness({
        autoclose: defined(conf.autoclose, false)
    });
    
    var stream = harness.createStream({ objectMode: conf.objectMode });
    var es = stream.pipe(conf.stream || createDefaultStream());
    if (canEmitExit) {
        es.on('error', function (err) { harness._exitCode = 1 });
    }
    
    var ended = false;
    stream.on('end', function () { ended = true });
    
    if (conf.exit === false) return harness;
    if (!canEmitExit || !canExit) return harness;

    var inErrorState = false;

    process.on('exit', function (code) {
        // let the process exit cleanly.
        if (code !== 0) {
            return
        }

        if (!ended) {
            var only = harness._results._only;
            for (var i = 0; i < harness._tests.length; i++) {
                var t = harness._tests[i];
                if (only && t.name !== only) continue;
                t._exit();
            }
        }
        harness.close();
        process.exit(code || harness._exitCode);
    });
    
    return harness;
}

exports.createHarness = createHarness;
exports.Test = Test;
exports.test = exports; // tap compat
exports.test.skip = Test.skip;

var exitInterval;

function createHarness (conf_) {
    if (!conf_) conf_ = {};
    var results = createResult();
    if (conf_.autoclose !== false) {
        results.once('done', function () { results.close() });
    }
    
    var test = function (name, conf, cb) {
        var t = new Test(name, conf, cb);
        test._tests.push(t);
        
        (function inspectCode (st) {
            st.on('test', function sub (st_) {
                inspectCode(st_);
            });
            st.on('result', function (r) {
                if (!r.ok) test._exitCode = 1
            });
        })(t);
        
        results.push(t);
        return t;
    };
    test._results = results;
    
    test._tests = [];
    
    test.createStream = function (opts) {
        return results.createStream(opts);
    };
    
    var only = false;
    test.only = function (name) {
        if (only) throw new Error('there can only be one only test');
        results.only(name);
        only = true;
        return test.apply(null, arguments);
    };
    test._exitCode = 0;
    
    test.close = function () { results.close() };
    
    return test;
}

}).call(this,require('_process'))
},{"./lib/default_stream":29,"./lib/results":30,"./lib/test":31,"_process":9,"defined":35,"through":39}],29:[function(require,module,exports){
(function (process){
var through = require('through');
var fs = require('fs');

module.exports = function () {
    var line = '';
    var stream = through(write, flush);
    return stream;
    
    function write (buf) {
        for (var i = 0; i < buf.length; i++) {
            var c = typeof buf === 'string'
                ? buf.charAt(i)
                : String.fromCharCode(buf[i])
            ;
            if (c === '\n') flush();
            else line += c;
        }
    }
    
    function flush () {
        if (fs.writeSync && /^win/.test(process.platform)) {
            try { fs.writeSync(1, line + '\n'); }
            catch (e) { stream.emit('error', e) }
        }
        else {
            try { console.log(line) }
            catch (e) { stream.emit('error', e) }
        }
        line = '';
    }
};

}).call(this,require('_process'))
},{"_process":9,"fs":1,"through":39}],30:[function(require,module,exports){
(function (process){
var EventEmitter = require('events').EventEmitter;
var inherits = require('inherits');
var through = require('through');
var resumer = require('resumer');
var inspect = require('object-inspect');
var nextTick = typeof setImmediate !== 'undefined'
    ? setImmediate
    : process.nextTick
;

module.exports = Results;
inherits(Results, EventEmitter);

function Results () {
    if (!(this instanceof Results)) return new Results;
    this.count = 0;
    this.fail = 0;
    this.pass = 0;
    this._stream = through();
    this.tests = [];
}

Results.prototype.createStream = function (opts) {
    if (!opts) opts = {};
    var self = this;
    var output, testId = 0;
    if (opts.objectMode) {
        output = through();
        self.on('_push', function ontest (t, extra) {
            if (!extra) extra = {};
            var id = testId++;
            t.once('prerun', function () {
                var row = {
                    type: 'test',
                    name: t.name,
                    id: id
                };
                if (has(extra, 'parent')) {
                    row.parent = extra.parent;
                }
                output.queue(row);
            });
            t.on('test', function (st) {
                ontest(st, { parent: id });
            });
            t.on('result', function (res) {
                res.test = id;
                res.type = 'assert';
                output.queue(res);
            });
            t.on('end', function () {
                output.queue({ type: 'end', test: id });
            });
        });
        self.on('done', function () { output.queue(null) });
    }
    else {
        output = resumer();
        output.queue('TAP version 13\n');
        self._stream.pipe(output);
    }
    
    nextTick(function next() {
        var t;
        while (t = getNextTest(self)) {
            t.run();
            if (!t.ended) return t.once('end', function(){ nextTick(next); });
        }
        self.emit('done');
    });
    
    return output;
};

Results.prototype.push = function (t) {
    var self = this;
    self.tests.push(t);
    self._watch(t);
    self.emit('_push', t);
};

Results.prototype.only = function (name) {
    if (this._only) {
        self.count ++;
        self.fail ++;
        write('not ok ' + self.count + ' already called .only()\n');
    }
    this._only = name;
};

Results.prototype._watch = function (t) {
    var self = this;
    var write = function (s) { self._stream.queue(s) };
    t.once('prerun', function () {
        write('# ' + t.name + '\n');
    });
    
    t.on('result', function (res) {
        if (typeof res === 'string') {
            write('# ' + res + '\n');
            return;
        }
        write(encodeResult(res, self.count + 1));
        self.count ++;

        if (res.ok) self.pass ++
        else self.fail ++
    });
    
    t.on('test', function (st) { self._watch(st) });
};

Results.prototype.close = function () {
    var self = this;
    if (self.closed) self._stream.emit('error', new Error('ALREADY CLOSED'));
    self.closed = true;
    var write = function (s) { self._stream.queue(s) };
    
    write('\n1..' + self.count + '\n');
    write('# tests ' + self.count + '\n');
    write('# pass  ' + self.pass + '\n');
    if (self.fail) write('# fail  ' + self.fail + '\n')
    else write('\n# ok\n')

    self._stream.queue(null);
};

function encodeResult (res, count) {
    var output = '';
    output += (res.ok ? 'ok ' : 'not ok ') + count;
    output += res.name ? ' ' + res.name.toString().replace(/\s+/g, ' ') : '';
    
    if (res.skip) output += ' # SKIP';
    else if (res.todo) output += ' # TODO';
    
    output += '\n';
    if (res.ok) return output;
    
    var outer = '  ';
    var inner = outer + '  ';
    output += outer + '---\n';
    output += inner + 'operator: ' + res.operator + '\n';
    
    if (has(res, 'expected') || has(res, 'actual')) {
        var ex = inspect(res.expected);
        var ac = inspect(res.actual);
        
        if (Math.max(ex.length, ac.length) > 65) {
            output += inner + 'expected:\n' + inner + '  ' + ex + '\n';
            output += inner + 'actual:\n' + inner + '  ' + ac + '\n';
        }
        else {
            output += inner + 'expected: ' + ex + '\n';
            output += inner + 'actual:   ' + ac + '\n';
        }
    }
    if (res.at) {
        output += inner + 'at: ' + res.at + '\n';
    }
    if (res.operator === 'error' && res.actual && res.actual.stack) {
        var lines = String(res.actual.stack).split('\n');
        output += inner + 'stack:\n';
        output += inner + '  ' + lines[0] + '\n';
        for (var i = 1; i < lines.length; i++) {
            output += inner + lines[i] + '\n';
        }
    }
    
    output += outer + '...\n';
    return output;
}

function getNextTest (results) {
    if (!results._only) {
        return results.tests.shift();
    }
    
    do {
        var t = results.tests.shift();
        if (!t) continue;
        if (results._only === t.name) {
            return t;
        }
    } while (results.tests.length !== 0)
}

function has (obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require('_process'))
},{"_process":9,"events":5,"inherits":36,"object-inspect":37,"resumer":38,"through":39}],31:[function(require,module,exports){
(function (process,__dirname){
var deepEqual = require('deep-equal');
var defined = require('defined');
var path = require('path');
var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;

module.exports = Test;

var nextTick = typeof setImmediate !== 'undefined'
    ? setImmediate
    : process.nextTick
;

inherits(Test, EventEmitter);

var getTestArgs = function (name_, opts_, cb_) {
    var name = '(anonymous)';
    var opts = {};
    var cb;

    for (var i = 0; i < arguments.length; i++) {
        var arg = arguments[i];
        var t = typeof arg;
        if (t === 'string') {
            name = arg;
        }
        else if (t === 'object') {
            opts = arg || opts;
        }
        else if (t === 'function') {
            cb = arg;
        }
    }
    return { name: name, opts: opts, cb: cb };
};

function Test (name_, opts_, cb_) {
    if (! (this instanceof Test)) {
        return new Test(name_, opts_, cb_);
    }

    var args = getTestArgs(name_, opts_, cb_);

    this.readable = true;
    this.name = args.name || '(anonymous)';
    this.assertCount = 0;
    this.pendingCount = 0;
    this._skip = args.opts.skip || false;
    this._plan = undefined;
    this._cb = args.cb;
    this._progeny = [];
    this._ok = true;

    if (args.opts.timeout !== undefined) {
        this.timeoutAfter(args.opts.timeout);
    }

    for (var prop in this) {
        this[prop] = (function bind(self, val) {
            if (typeof val === 'function') {
                return function bound() {
                    return val.apply(self, arguments);
                };
            }
            else return val;
        })(this, this[prop]);
    }
}

Test.prototype.run = function () {
    if (!this._cb || this._skip) {
        return this._end();
    }
    this.emit('prerun');
    this._cb(this);
    this.emit('run');
};

Test.prototype.test = function (name, opts, cb) {
    var self = this;
    var t = new Test(name, opts, cb);
    this._progeny.push(t);
    this.pendingCount++;
    this.emit('test', t);
    t.on('prerun', function () {
        self.assertCount++;
    })
    
    if (!self._pendingAsserts()) {
        nextTick(function () {
            self._end();
        });
    }
    
    nextTick(function() {
        if (!self._plan && self.pendingCount == self._progeny.length) {
            self._end();
        }
    });
};

Test.prototype.comment = function (msg) {
    this.emit('result', msg.trim().replace(/^#\s*/, ''));
};

Test.prototype.plan = function (n) {
    this._plan = n;
    this.emit('plan', n);
};

Test.prototype.timeoutAfter = function(ms) {
    if (!ms) throw new Error('timeoutAfter requires a timespan');
    var self = this;
    var timeout = setTimeout(function() {
        self.fail('test timed out after ' + ms + 'ms');
        self.end();
    }, ms);
    this.once('end', function() {
        clearTimeout(timeout);
    });
}

Test.prototype.end = function (err) { 
    var self = this;
    if (arguments.length >= 1 && !!err) {
        this.ifError(err);
    }
    
    if (this.calledEnd) {
        this.fail('.end() called twice');
    }
    this.calledEnd = true;
    this._end();
};

Test.prototype._end = function (err) {
    var self = this;
    if (this._progeny.length) {
        var t = this._progeny.shift();
        t.on('end', function () { self._end() });
        t.run();
        return;
    }
    
    if (!this.ended) this.emit('end');
    var pendingAsserts = this._pendingAsserts();
    if (!this._planError && this._plan !== undefined && pendingAsserts) {
        this._planError = true;
        this.fail('plan != count', {
            expected : this._plan,
            actual : this.assertCount
        });
    }
    this.ended = true;
};

Test.prototype._exit = function () {
    if (this._plan !== undefined &&
        !this._planError && this.assertCount !== this._plan) {
        this._planError = true;
        this.fail('plan != count', {
            expected : this._plan,
            actual : this.assertCount,
            exiting : true
        });
    }
    else if (!this.ended) {
        this.fail('test exited without ending', {
            exiting: true
        });
    }
};

Test.prototype._pendingAsserts = function () {
    if (this._plan === undefined) {
        return 1;
    }
    else {
        return this._plan - (this._progeny.length + this.assertCount);
    }
};

Test.prototype._assert = function assert (ok, opts) {
    var self = this;
    var extra = opts.extra || {};
    
    var res = {
        id : self.assertCount ++,
        ok : Boolean(ok),
        skip : defined(extra.skip, opts.skip),
        name : defined(extra.message, opts.message, '(unnamed assert)'),
        operator : defined(extra.operator, opts.operator)
    };
    if (has(opts, 'actual') || has(extra, 'actual')) {
        res.actual = defined(extra.actual, opts.actual);
    }
    if (has(opts, 'expected') || has(extra, 'expected')) {
        res.expected = defined(extra.expected, opts.expected);
    }
    this._ok = Boolean(this._ok && ok);
    
    if (!ok) {
        res.error = defined(extra.error, opts.error, new Error(res.name));
    }
    
    if (!ok) {
        var e = new Error('exception');
        var err = (e.stack || '').split('\n');
        var dir = path.dirname(__dirname) + '/';
        
        for (var i = 0; i < err.length; i++) {
            var m = /^[^\s]*\s*\bat\s+(.+)/.exec(err[i]);
            if (!m) {
                continue;
            }
            
            var s = m[1].split(/\s+/);
            var filem = /(\/[^:\s]+:(\d+)(?::(\d+))?)/.exec(s[1]);
            if (!filem) {
                filem = /(\/[^:\s]+:(\d+)(?::(\d+))?)/.exec(s[2]);
                
                if (!filem) {
                    filem = /(\/[^:\s]+:(\d+)(?::(\d+))?)/.exec(s[3]);

                    if (!filem) {
                        continue;
                    }
                }
            }
            
            if (filem[1].slice(0, dir.length) === dir) {
                continue;
            }
            
            res.functionName = s[0];
            res.file = filem[1];
            res.line = Number(filem[2]);
            if (filem[3]) res.column = filem[3];
            
            res.at = m[1];
            break;
        }
    }

    self.emit('result', res);
    
    var pendingAsserts = self._pendingAsserts();
    if (!pendingAsserts) {
        if (extra.exiting) {
            self._end();
        } else {
            nextTick(function () {
                self._end();
            });
        }
    }
    
    if (!self._planError && pendingAsserts < 0) {
        self._planError = true;
        self.fail('plan != count', {
            expected : self._plan,
            actual : self._plan - pendingAsserts
        });
    }
};

Test.prototype.fail = function (msg, extra) {
    this._assert(false, {
        message : msg,
        operator : 'fail',
        extra : extra
    });
};

Test.prototype.pass = function (msg, extra) {
    this._assert(true, {
        message : msg,
        operator : 'pass',
        extra : extra
    });
};

Test.prototype.skip = function (msg, extra) {
    this._assert(true, {
        message : msg,
        operator : 'skip',
        skip : true,
        extra : extra
    });
};

Test.prototype.ok
= Test.prototype['true']
= Test.prototype.assert
= function (value, msg, extra) {
    this._assert(value, {
        message : msg,
        operator : 'ok',
        expected : true,
        actual : value,
        extra : extra
    });
};

Test.prototype.notOk
= Test.prototype['false']
= Test.prototype.notok
= function (value, msg, extra) {
    this._assert(!value, {
        message : msg,
        operator : 'notOk',
        expected : false,
        actual : value,
        extra : extra
    });
};

Test.prototype.error
= Test.prototype.ifError
= Test.prototype.ifErr
= Test.prototype.iferror
= function (err, msg, extra) {
    this._assert(!err, {
        message : defined(msg, String(err)),
        operator : 'error',
        actual : err,
        extra : extra
    });
};

Test.prototype.equal
= Test.prototype.equals
= Test.prototype.isEqual
= Test.prototype.is
= Test.prototype.strictEqual
= Test.prototype.strictEquals
= function (a, b, msg, extra) {
    this._assert(a === b, {
        message : defined(msg, 'should be equal'),
        operator : 'equal',
        actual : a,
        expected : b,
        extra : extra
    });
};

Test.prototype.notEqual
= Test.prototype.notEquals
= Test.prototype.notStrictEqual
= Test.prototype.notStrictEquals
= Test.prototype.isNotEqual
= Test.prototype.isNot
= Test.prototype.not
= Test.prototype.doesNotEqual
= Test.prototype.isInequal
= function (a, b, msg, extra) {
    this._assert(a !== b, {
        message : defined(msg, 'should not be equal'),
        operator : 'notEqual',
        actual : a,
        notExpected : b,
        extra : extra
    });
};

Test.prototype.deepEqual
= Test.prototype.deepEquals
= Test.prototype.isEquivalent
= Test.prototype.same
= function (a, b, msg, extra) {
    this._assert(deepEqual(a, b, { strict: true }), {
        message : defined(msg, 'should be equivalent'),
        operator : 'deepEqual',
        actual : a,
        expected : b,
        extra : extra
    });
};

Test.prototype.deepLooseEqual
= Test.prototype.looseEqual
= Test.prototype.looseEquals
= function (a, b, msg, extra) {
    this._assert(deepEqual(a, b), {
        message : defined(msg, 'should be equivalent'),
        operator : 'deepLooseEqual',
        actual : a,
        expected : b,
        extra : extra
    });
};

Test.prototype.notDeepEqual
= Test.prototype.notEquivalent
= Test.prototype.notDeeply
= Test.prototype.notSame
= Test.prototype.isNotDeepEqual
= Test.prototype.isNotDeeply
= Test.prototype.isNotEquivalent
= Test.prototype.isInequivalent
= function (a, b, msg, extra) {
    this._assert(!deepEqual(a, b, { strict: true }), {
        message : defined(msg, 'should not be equivalent'),
        operator : 'notDeepEqual',
        actual : a,
        notExpected : b,
        extra : extra
    });
};

Test.prototype.notDeepLooseEqual
= Test.prototype.notLooseEqual
= Test.prototype.notLooseEquals
= function (a, b, msg, extra) {
    this._assert(!deepEqual(a, b), {
        message : defined(msg, 'should be equivalent'),
        operator : 'notDeepLooseEqual',
        actual : a,
        expected : b,
        extra : extra
    });
};

Test.prototype['throws'] = function (fn, expected, msg, extra) {
    if (typeof expected === 'string') {
        msg = expected;
        expected = undefined;
    }

    var caught = undefined;

    try {
        fn();
    } catch (err) {
        caught = { error : err };
        var message = err.message;
        delete err.message;
        err.message = message;
    }

    var passed = caught;

    if (expected instanceof RegExp) {
        passed = expected.test(caught && caught.error);
        expected = String(expected);
    }

    if (typeof expected === 'function' && caught) {
        passed = caught.error instanceof expected;
        caught.error = caught.error.constructor;
    }

    this._assert(passed, {
        message : defined(msg, 'should throw'),
        operator : 'throws',
        actual : caught && caught.error,
        expected : expected,
        error: !passed && caught && caught.error,
        extra : extra
    });
};

Test.prototype.doesNotThrow = function (fn, expected, msg, extra) {
    if (typeof expected === 'string') {
        msg = expected;
        expected = undefined;
    }
    var caught = undefined;
    try {
        fn();
    }
    catch (err) {
        caught = { error : err };
    }
    this._assert(!caught, {
        message : defined(msg, 'should not throw'),
        operator : 'throws',
        actual : caught && caught.error,
        expected : expected,
        error : caught && caught.error,
        extra : extra
    });
};

function has (obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
}

Test.skip = function (name_, _opts, _cb) {
    var args = getTestArgs.apply(null, arguments);
    args.opts.skip = true;
    return Test(args.name, args.opts, args.cb);
};

// vim: set softtabstop=4 shiftwidth=4:


}).call(this,require('_process'),"/node_modules/tape/lib")
},{"_process":9,"deep-equal":32,"defined":35,"events":5,"inherits":36,"path":8}],32:[function(require,module,exports){
var pSlice = Array.prototype.slice;
var objectKeys = require('./lib/keys.js');
var isArguments = require('./lib/is_arguments.js');

var deepEqual = module.exports = function (actual, expected, opts) {
  if (!opts) opts = {};
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();

  // 7.3. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (typeof actual != 'object' && typeof expected != 'object') {
    return opts.strict ? actual === expected : actual == expected;

  // 7.4. For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected, opts);
  }
}

function isUndefinedOrNull(value) {
  return value === null || value === undefined;
}

function isBuffer (x) {
  if (!x || typeof x !== 'object' || typeof x.length !== 'number') return false;
  if (typeof x.copy !== 'function' || typeof x.slice !== 'function') {
    return false;
  }
  if (x.length > 0 && typeof x[0] !== 'number') return false;
  return true;
}

function objEquiv(a, b, opts) {
  var i, key;
  if (isUndefinedOrNull(a) || isUndefinedOrNull(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return deepEqual(a, b, opts);
  }
  if (isBuffer(a)) {
    if (!isBuffer(b)) {
      return false;
    }
    if (a.length !== b.length) return false;
    for (i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  try {
    var ka = objectKeys(a),
        kb = objectKeys(b);
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!deepEqual(a[key], b[key], opts)) return false;
  }
  return typeof a === typeof b;
}

},{"./lib/is_arguments.js":33,"./lib/keys.js":34}],33:[function(require,module,exports){
var supportsArgumentsClass = (function(){
  return Object.prototype.toString.call(arguments)
})() == '[object Arguments]';

exports = module.exports = supportsArgumentsClass ? supported : unsupported;

exports.supported = supported;
function supported(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
};

exports.unsupported = unsupported;
function unsupported(object){
  return object &&
    typeof object == 'object' &&
    typeof object.length == 'number' &&
    Object.prototype.hasOwnProperty.call(object, 'callee') &&
    !Object.prototype.propertyIsEnumerable.call(object, 'callee') ||
    false;
};

},{}],34:[function(require,module,exports){
exports = module.exports = typeof Object.keys === 'function'
  ? Object.keys : shim;

exports.shim = shim;
function shim (obj) {
  var keys = [];
  for (var key in obj) keys.push(key);
  return keys;
}

},{}],35:[function(require,module,exports){
module.exports = function () {
    for (var i = 0; i < arguments.length; i++) {
        if (arguments[i] !== undefined) return arguments[i];
    }
};

},{}],36:[function(require,module,exports){
module.exports=require(6)
},{}],37:[function(require,module,exports){
module.exports = function inspect_ (obj, opts, depth, seen) {
    if (!opts) opts = {};
    
    var maxDepth = opts.depth === undefined ? 5 : opts.depth;
    if (depth === undefined) depth = 0;
    if (depth >= maxDepth && maxDepth > 0
    && obj && typeof obj === 'object') {
        return '[Object]';
    }
    
    if (seen === undefined) seen = [];
    else if (indexOf(seen, obj) >= 0) {
        return '[Circular]';
    }
    
    function inspect (value, from) {
        if (from) {
            seen = seen.slice();
            seen.push(from);
        }
        return inspect_(value, opts, depth + 1, seen);
    }
    
    if (typeof obj === 'string') {
        return inspectString(obj);
    }
    else if (typeof obj === 'function') {
        var name = nameOf(obj);
        return '[Function' + (name ? ': ' + name : '') + ']';
    }
    else if (obj === null) {
        return 'null';
    }
    else if (isElement(obj)) {
        var s = '<' + String(obj.nodeName).toLowerCase();
        var attrs = obj.attributes || [];
        for (var i = 0; i < attrs.length; i++) {
            s += ' ' + attrs[i].name + '="' + quote(attrs[i].value) + '"';
        }
        s += '>';
        if (obj.childNodes && obj.childNodes.length) s += '...';
        s += '</' + String(obj.nodeName).toLowerCase() + '>';
        return s;
    }
    else if (isArray(obj)) {
        if (obj.length === 0) return '[]';
        var xs = Array(obj.length);
        for (var i = 0; i < obj.length; i++) {
            xs[i] = has(obj, i) ? inspect(obj[i], obj) : '';
        }
        return '[ ' + xs.join(', ') + ' ]';
    }
    else if (isError(obj)) {
        var parts = [];
        for (var key in obj) {
            if (!has(obj, key)) continue;
            
            if (/[^\w$]/.test(key)) {
                parts.push(inspect(key) + ': ' + inspect(obj[key]));
            }
            else {
                parts.push(key + ': ' + inspect(obj[key]));
            }
        }
        if (parts.length === 0) return '[' + obj + ']';
        return '{ [' + obj + '] ' + parts.join(', ') + ' }';
    }
    else if (typeof obj === 'object' && typeof obj.inspect === 'function') {
        return obj.inspect();
    }
    else if (typeof obj === 'object' && !isDate(obj) && !isRegExp(obj)) {
        var xs = [], keys = [];
        for (var key in obj) {
            if (has(obj, key)) keys.push(key);
        }
        keys.sort();
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (/[^\w$]/.test(key)) {
                xs.push(inspect(key) + ': ' + inspect(obj[key], obj));
            }
            else xs.push(key + ': ' + inspect(obj[key], obj));
        }
        if (xs.length === 0) return '{}';
        return '{ ' + xs.join(', ') + ' }';
    }
    else return String(obj);
};

function quote (s) {
    return String(s).replace(/"/g, '&quot;');
}

function isArray (obj) { return toStr(obj) === '[object Array]' }
function isDate (obj) { return toStr(obj) === '[object Date]' }
function isRegExp (obj) { return toStr(obj) === '[object RegExp]' }
function isError (obj) { return toStr(obj) === '[object Error]' }

function has (obj, key) {
    if (!{}.hasOwnProperty) return key in obj;
    return {}.hasOwnProperty.call(obj, key);
}

function toStr (obj) {
    return Object.prototype.toString.call(obj);
}

function nameOf (f) {
    if (f.name) return f.name;
    var m = f.toString().match(/^function\s*([\w$]+)/);
    if (m) return m[1];
}

function indexOf (xs, x) {
    if (xs.indexOf) return xs.indexOf(x);
    for (var i = 0, l = xs.length; i < l; i++) {
        if (xs[i] === x) return i;
    }
    return -1;
}

function isElement (x) {
    if (!x || typeof x !== 'object') return false;
    if (typeof HTMLElement !== 'undefined' && x instanceof HTMLElement) {
        return true;
    }
    return typeof x.nodeName === 'string'
        && typeof x.getAttribute === 'function'
    ;
}

function inspectString (str) {
    var s = str.replace(/(['\\])/g, '\\$1').replace(/[\x00-\x1f]/g, lowbyte);
    return "'" + s + "'";
    
    function lowbyte (c) {
        var n = c.charCodeAt(0);
        var x = { 8: 'b', 9: 't', 10: 'n', 12: 'f', 13: 'r' }[n];
        if (x) return '\\' + x;
        return '\\x' + (n < 0x10 ? '0' : '') + n.toString(16);
    }
}

},{}],38:[function(require,module,exports){
(function (process){
var through = require('through');
var nextTick = typeof setImmediate !== 'undefined'
    ? setImmediate
    : process.nextTick
;

module.exports = function (write, end) {
    var tr = through(write, end);
    tr.pause();
    var resume = tr.resume;
    var pause = tr.pause;
    var paused = false;
    
    tr.pause = function () {
        paused = true;
        return pause.apply(this, arguments);
    };
    
    tr.resume = function () {
        paused = false;
        return resume.apply(this, arguments);
    };
    
    nextTick(function () {
        if (!paused) tr.resume();
    });
    
    return tr;
};

}).call(this,require('_process'))
},{"_process":9,"through":39}],39:[function(require,module,exports){
(function (process){
var Stream = require('stream')

// through
//
// a stream that does nothing but re-emit the input.
// useful for aggregating a series of changing but not ending streams into one stream)

exports = module.exports = through
through.through = through

//create a readable writable stream.

function through (write, end, opts) {
  write = write || function (data) { this.queue(data) }
  end = end || function () { this.queue(null) }

  var ended = false, destroyed = false, buffer = [], _ended = false
  var stream = new Stream()
  stream.readable = stream.writable = true
  stream.paused = false

//  stream.autoPause   = !(opts && opts.autoPause   === false)
  stream.autoDestroy = !(opts && opts.autoDestroy === false)

  stream.write = function (data) {
    write.call(this, data)
    return !stream.paused
  }

  function drain() {
    while(buffer.length && !stream.paused) {
      var data = buffer.shift()
      if(null === data)
        return stream.emit('end')
      else
        stream.emit('data', data)
    }
  }

  stream.queue = stream.push = function (data) {
//    console.error(ended)
    if(_ended) return stream
    if(data === null) _ended = true
    buffer.push(data)
    drain()
    return stream
  }

  //this will be registered as the first 'end' listener
  //must call destroy next tick, to make sure we're after any
  //stream piped from here.
  //this is only a problem if end is not emitted synchronously.
  //a nicer way to do this is to make sure this is the last listener for 'end'

  stream.on('end', function () {
    stream.readable = false
    if(!stream.writable && stream.autoDestroy)
      process.nextTick(function () {
        stream.destroy()
      })
  })

  function _end () {
    stream.writable = false
    end.call(stream)
    if(!stream.readable && stream.autoDestroy)
      stream.destroy()
  }

  stream.end = function (data) {
    if(ended) return
    ended = true
    if(arguments.length) stream.write(data)
    _end() // will emit or queue
    return stream
  }

  stream.destroy = function () {
    if(destroyed) return
    destroyed = true
    ended = true
    buffer.length = 0
    stream.writable = stream.readable = false
    stream.emit('close')
    return stream
  }

  stream.pause = function () {
    if(stream.paused) return
    stream.paused = true
    return stream
  }

  stream.resume = function () {
    if(stream.paused) {
      stream.paused = false
      stream.emit('resume')
    }
    drain()
    //may have become paused again,
    //as drain emits 'data'.
    if(!stream.paused)
      stream.emit('drain')
    return stream
  }
  return stream
}


}).call(this,require('_process'))
},{"_process":9,"stream":22}],40:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

exports["default"] = function () {
  throw "should fail";
};

;
module.exports = exports["default"];

module.exports.__get__ = function __get__() {
    arguments.varName = arguments[0];
    if (arguments.varName && typeof arguments.varName === "string") {
        return eval(arguments.varName);
    } else {
        throw new TypeError("__get__ expects a non-empty string");
    }
};
module.exports.__set__ = function __set__() {
    arguments.varName = arguments[0];
    arguments.varValue = arguments[1];
    arguments.src = "";

    if (typeof arguments[0] === "object" && arguments.length === 1) {
        arguments.env = arguments.varName;
        if (!arguments.env || Array.isArray(arguments.env)) {
            throw new TypeError("__set__ expects an object as env");
        }
        for (arguments.varName in arguments.env) {
            if (arguments.env.hasOwnProperty(arguments.varName)) {
                arguments.varValue = arguments.env[arguments.varName];
                arguments.src += arguments.varName + " = arguments.env." + arguments.varName + "; ";
            }
        }
    } else if (typeof arguments.varName === "string" && arguments.length === 2) {
        if (!arguments.varName) {
            throw new TypeError("__set__ expects a non-empty string as a variable name");
        }
        arguments.src = arguments.varName + " = arguments.varValue;";
    } else {
        throw new TypeError("__set__ expects an environment object or a non-empty string as a variable name");
    }

    eval(arguments.src);
};

},{}],41:[function(require,module,exports){
'use strict';

require('tape-catch');

require('./test/Store');
require('./test/ServerStore');

module.exports.__get__ = function __get__() {
    arguments.varName = arguments[0];
    if (arguments.varName && typeof arguments.varName === "string") {
        return eval(arguments.varName);
    } else {
        throw new TypeError("__get__ expects a non-empty string");
    }
};
module.exports.__set__ = function __set__() {
    arguments.varName = arguments[0];
    arguments.varValue = arguments[1];
    arguments.src = "";

    if (typeof arguments[0] === "object" && arguments.length === 1) {
        arguments.env = arguments.varName;
        if (!arguments.env || Array.isArray(arguments.env)) {
            throw new TypeError("__set__ expects an object as env");
        }
        for (arguments.varName in arguments.env) {
            if (arguments.env.hasOwnProperty(arguments.varName)) {
                arguments.varValue = arguments.env[arguments.varName];
                arguments.src += arguments.varName + " = arguments.env." + arguments.varName + "; ";
            }
        }
    } else if (typeof arguments.varName === "string" && arguments.length === 2) {
        if (!arguments.varName) {
            throw new TypeError("__set__ expects a non-empty string as a variable name");
        }
        arguments.src = arguments.varName + " = arguments.varValue;";
    } else {
        throw new TypeError("__set__ expects an environment object or a non-empty string as a variable name");
    }

    eval(arguments.src);
};

},{"./test/ServerStore":42,"./test/Store":43,"tape-catch":27}],42:[function(require,module,exports){
'use strict';

var _interopRequireDefault = function (obj) { return obj && obj.__esModule ? obj : { 'default': obj }; };

var _test = require('tape');

var _test2 = _interopRequireDefault(_test);

var _m = require('mori');

var _m2 = _interopRequireDefault(_m);

var _B = require('bluebird');

var _B2 = _interopRequireDefault(_B);

_test2['default']('ServerStore', function (t) {
	var s, ServerStore;
	function setup() {
		ServerStore = require('../ServerStore');
		s = new ServerStore('test', [2]);
	}

	t.test('basic get and set works on server', function (t) {
		setup();
		t.ok(_m2['default'].equals(s.get(), _m2['default'].hashMap()), 'basic is empty');
		s.set(['a'], 'b');
		t.ok(s.get(['a']) == 'b', 'key get works');
		// t.ok(s.get([ 'b' ]) == null, 'empty key is empty');
		t.ok(_m2['default'].equals(s.get(), _m2['default'].hashMap('a', 'b')), 'map get works');
		t.end();
	});

	t.test('getter doesn\'t notify', function (t) {
		setup();
		t.plan(1);
		ServerStore.__set__('_server2', { 'default': function _default() {
				return new _B2['default'](function () {});
			} });
		s.subscribe(['a', 'b'], function () {
			t.ok(true, 'subscription called');
		});
		s.get(['a', 'b']);
		t.ok(true, 'passed');
	});

	t.test('subscribe/notify works on server function', function (t) {
		setup();
		t.plan(3);
		s.subscribe(['a'], function () {
			console.log('HERE???');t.ok(true, 'subscription called');
		});

		ServerStore.__set__('_server2', { 'default': function _default() {
				console.log('HERE!!!!');return _B2['default'].resolve('abc');
			} });

		s.get(['a', 'b']);
		s.get(['a', 'c']);
		t.ok(true, 'finished');
	});
	/*
 t.test('nested get and set works', (t) => {
 	s.set([ 'a', 'b' ], 'c');
 		t.ok(s.get([ 'a', 'b' ]) == 'c', 'key get works');
 	t.ok(s.get([ 'b' ]) == null, 'empty key is empty');
 		t.ok(m.equals(s.get(), m.hashMap('a', m.hashMap('b', 'c'))), 'map get works');
 	t.ok(m.equals(s.get([ 'a' ]), m.hashMap('b', 'c')), 'map get 2 works');
 		t.end();
 });
 	t.test('subscribe/notify works', (t) => {
 	t.plan(2);
 	s.subscribe([ 'a', 'b' ], () => {
 		t.ok(true, 'was notified');
 	});
 	s.set([ 'a', 'b' ], 'b');
 	s.set([ 'a', 'b' ], 'c');
 	s.set([ 'a', 'c' ], 'c');
 });
 	t.test('parent subscribe/notify works', (t) => {
 	t.plan(3);
 	s.subscribe([ 'a' ], () => { t.ok(true, 'was notified'); });
 	s.set([ 'a', 'b' ], 'b');
 	s.set([ 'a', 'b' ], 'c');
 	s.set([ 'a', 'c' ], 'c');
 	s.set([ 'b', 'c' ], 'd');
 });
 	t.test('unsubscribe works', (t) => {
 	t.plan(1);
 		var f = () => {
 		// if not ok, this gets called over and over until we hit the recursion limit.
 		t.ok(true, 'was notified');
 		s.unsubscribe([ 'a', 'b' ], f);
 		s.set([ 'a', 'b' ], 'c');
 	};
 		s.subscribe([ 'a', 'b' ], f);
 	s.set([ 'a', 'b' ], 'b');
 });
 */
	t.end();
});

module.exports.__get__ = function __get__() {
    arguments.varName = arguments[0];
    if (arguments.varName && typeof arguments.varName === "string") {
        return eval(arguments.varName);
    } else {
        throw new TypeError("__get__ expects a non-empty string");
    }
};
module.exports.__set__ = function __set__() {
    arguments.varName = arguments[0];
    arguments.varValue = arguments[1];
    arguments.src = "";

    if (typeof arguments[0] === "object" && arguments.length === 1) {
        arguments.env = arguments.varName;
        if (!arguments.env || Array.isArray(arguments.env)) {
            throw new TypeError("__set__ expects an object as env");
        }
        for (arguments.varName in arguments.env) {
            if (arguments.env.hasOwnProperty(arguments.varName)) {
                arguments.varValue = arguments.env[arguments.varName];
                arguments.src += arguments.varName + " = arguments.env." + arguments.varName + "; ";
            }
        }
    } else if (typeof arguments.varName === "string" && arguments.length === 2) {
        if (!arguments.varName) {
            throw new TypeError("__set__ expects a non-empty string as a variable name");
        }
        arguments.src = arguments.varName + " = arguments.varValue;";
    } else {
        throw new TypeError("__set__ expects an environment object or a non-empty string as a variable name");
    }

    eval(arguments.src);
};

},{"../ServerStore":23,"bluebird":25,"mori":26,"tape":28}],43:[function(require,module,exports){
'use strict';

var _interopRequireDefault = function (obj) { return obj && obj.__esModule ? obj : { 'default': obj }; };

var _test = require('tape');

var _test2 = _interopRequireDefault(_test);

var _m = require('mori');

var _m2 = _interopRequireDefault(_m);

var _Store = require('../Store');

var _Store2 = _interopRequireDefault(_Store);

_test2['default']('Store', function (t) {
	var s;
	function setup() {
		s = new _Store2['default']();
	};

	t.test('basic get and set works', function (t) {
		setup();
		t.ok(_m2['default'].equals(s.get(), _m2['default'].hashMap()), 'basic is empty');
		s.set(['a'], 'b');
		t.ok(s.get(['a']) == 'b', 'key get works');
		t.ok(s.get(['b']) == null, 'empty key is empty');
		t.ok(_m2['default'].equals(s.get(), _m2['default'].hashMap('a', 'b')), 'map get works');
		t.end();
	});

	t.test('subscribe/notify works', function (t) {
		setup();
		t.plan(2);
		s.subscribe(['a'], function () {
			t.ok(true, 'was notified');
		});
		s.set(['a'], 'b');
		s.set(['a'], 'c');
	});

	t.test('unsubscribe works', function (t) {
		setup();
		t.plan(1);

		var f = (function (_f) {
			function f() {
				return _f.apply(this, arguments);
			}

			f.toString = function () {
				return _f.toString();
			};

			return f;
		})(function () {
			// if not ok, this gets called over and over until we hit the recursion limit.
			t.ok(true, 'was notified');
			s.unsubscribe(['a'], f);
			s.set(['a'], 'c');
		});

		s.subscribe(['a'], f);
		s.set(['a'], 'b');
	});

	t.test('nested get and set works', function (t) {
		setup();
		s.set(['a', 'b'], 'c');

		t.ok(s.get(['a', 'b']) == 'c', 'key get works');
		t.ok(s.get(['b']) == null, 'empty key is empty');

		t.ok(_m2['default'].equals(s.get(), _m2['default'].hashMap('a', _m2['default'].hashMap('b', 'c'))), 'map get works');
		t.ok(_m2['default'].equals(s.get(['a']), _m2['default'].hashMap('b', 'c')), 'map get 2 works');

		t.end();
	});

	t.test('subscribe/notify works', function (t) {
		setup();
		t.plan(2);
		s.subscribe(['a', 'b'], function () {
			t.ok(true, 'was notified');
		});
		s.set(['a', 'b'], 'b');
		s.set(['a', 'b'], 'c');
		s.set(['a', 'c'], 'c');
	});

	t.test('parent subscribe/notify works', function (t) {
		setup();
		t.plan(3);
		s.subscribe(['a'], function () {
			t.ok(true, 'was notified');
		});
		s.set(['a', 'b'], 'b');
		s.set(['a', 'b'], 'c');
		s.set(['a', 'c'], 'c');
		s.set(['b', 'c'], 'd');
	});

	t.test('unsubscribe works', function (t) {
		setup();
		t.plan(1);

		var f = (function (_f2) {
			function f() {
				return _f2.apply(this, arguments);
			}

			f.toString = function () {
				return _f2.toString();
			};

			return f;
		})(function () {
			// if not ok, this gets called over and over until we hit the recursion limit.
			t.ok(true, 'was notified');
			s.unsubscribe(['a', 'b'], f);
			s.set(['a', 'b'], 'c');
		});

		s.subscribe(['a', 'b'], f);
		s.set(['a', 'b'], 'b');
	});

	t.end();
});

module.exports.__get__ = function __get__() {
    arguments.varName = arguments[0];
    if (arguments.varName && typeof arguments.varName === "string") {
        return eval(arguments.varName);
    } else {
        throw new TypeError("__get__ expects a non-empty string");
    }
};
module.exports.__set__ = function __set__() {
    arguments.varName = arguments[0];
    arguments.varValue = arguments[1];
    arguments.src = "";

    if (typeof arguments[0] === "object" && arguments.length === 1) {
        arguments.env = arguments.varName;
        if (!arguments.env || Array.isArray(arguments.env)) {
            throw new TypeError("__set__ expects an object as env");
        }
        for (arguments.varName in arguments.env) {
            if (arguments.env.hasOwnProperty(arguments.varName)) {
                arguments.varValue = arguments.env[arguments.varName];
                arguments.src += arguments.varName + " = arguments.env." + arguments.varName + "; ";
            }
        }
    } else if (typeof arguments.varName === "string" && arguments.length === 2) {
        if (!arguments.varName) {
            throw new TypeError("__set__ expects a non-empty string as a variable name");
        }
        arguments.src = arguments.varName + " = arguments.varValue;";
    } else {
        throw new TypeError("__set__ expects an environment object or a non-empty string as a variable name");
    }

    eval(arguments.src);
};

},{"../Store":24,"mori":26,"tape":28}]},{},[41]);
