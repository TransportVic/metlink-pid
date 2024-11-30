import { default as crc16 } from '@taichunmin/crc/crc16x25'

export function crc(str) {
  let checksum = crc16(Buffer.from(str))
  let high = (checksum & 0xFF00) >> 8
  let low = checksum & 0x00FF
  
  return Buffer.from([low, high])
}

export function verify(bytes) {
  if (bytes.length < 2) throw new RangeError('Value must be at least 2 bytes in length')
  let bytesOut = bytes.subarray(0, -2)
  let crcIn = bytes.subarray(-2)

  let crcOut = crc(bytesOut)
  if (crcIn !== crcOut) throw new RangeError(`Got CRC value ${crcIn.toString(16)} when ${crcOut.toString(16)} was expected`)
  
  return bytesOut
}