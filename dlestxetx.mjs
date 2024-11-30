const STX = 0x02
const ETX = 0x03
const DLE = 0x10

const PACKET_HEADER = Buffer.from([DLE, STX])
const PACKET_FOOTER = Buffer.from([DLE, ETX])
const ESCAPED_DLE = Buffer.from([DLE, DLE])

/**
 * Wraps data into a DLE/STX/ETX packet.
 * 
 * @param {Buffer} data The data to encode
 * @returns The packet containing the supplied data
 */
export function encode(data) {
  let output = [ ...PACKET_HEADER ]

  for (let char of data) {
    if (char === DLE) output.push(...ESCAPED_DLE)
    else output.push(char)
  }

  output.push(...PACKET_FOOTER)

  return Buffer.from(output)
}

/**
 * Read precisely one DLE/STX/ETX packet and unwraps it.
 * 
 * @param {Buffer} data The packet to decode
 * @returns {Buffer} The data within the supplied packet
 * @throws {RangeError} if the input doesn't represent a valid packet, or if extraneous bytes follow that packet.
 */
export function decode(data) {
  let header = data.subarray(0, PACKET_HEADER.length)
  if (!PACKET_HEADER.equals(header)) throw new RangeError(`Incorrect header: Found ${header.toString('hex')} where ${PACKET_HEADER.toString('hex')} was expected`)
  
  let decoded = Buffer.alloc(data.length)
  let size = 0
  let bytesRead = PACKET_HEADER.length

  let buffer = Buffer.alloc(2)
  let buffSize = 0

  while (true) {
    while (buffSize < 2 && bytesRead < data.length) buffer.writeUint8(data.readUint8(bytesRead++), buffSize++)

    if (buffSize !== 2) throw new RangeError('Unexpected end of packet')

    if (buffer[0] === DLE) {
      if (buffer.equals(ESCAPED_DLE)) {
        decoded.writeUint8(DLE, size++)
        buffer = Buffer.alloc(2)
        buffSize = 0
      } else if (buffer.equals(PACKET_FOOTER)) break
      else throw new RangeError(`Found ${buffer[1].toString(16)} where ${ETX.toString(16)} or ${DLE.toString(16)} was expected`)
    } else {
      let [ firstChar, secondChar ] = buffer
      decoded.writeUint8(firstChar, size++)
      buffer.writeUint8(secondChar, 0)
      buffSize -= 1
    }
  }

  if (bytesRead !== data.length) throw new RangeError(`Extraneous bytes from index ${bytesRead++}: ${data.subarray(bytesRead)}`)

  return decoded.subarray(0, size)
}