import { expect } from 'chai'
import { decode, encode } from '../dlestxetx.mjs'

describe('The DLE-STX-ETX class', () => {
  it('Should encode data', () => {
    expect(encode(Buffer.from([]))).to.deep.equal(Buffer.from([
      0x10, 0x02, 0x10, 0x03
    ]))

    expect(encode(Buffer.from([
      0x01, 0x10, 0x05
    ]))).to.deep.equal(Buffer.from([
      0x10, 0x02, 0x01, 0x10, 0x10, 0x05, 0x10, 0x03
    ]))
  })

  it('Should decode data', () => {
    expect(decode(Buffer.from([
      0x10, 0x02, 0x10, 0x03
    ]))).to.deep.equal(Buffer.from([]))

    expect(decode(Buffer.from([
      0x10, 0x02, 0x10, 0x10, 0x10, 0x03
    ]))).to.deep.equal(Buffer.from([ 0x10 ]))

    expect(decode(Buffer.from([
      0x10, 0x02, 0x01, 0x10, 0x10, 0x05, 0x10, 0x03
    ]))).to.deep.equal(Buffer.from([
      0x01, 0x10, 0x05
    ]))

    expect(() => decode(Buffer.from([
      0x10, 0x02, 0x10, 0x03, 0x99
    ]))).to.throw(/Extraneous bytes/)

    expect(() => decode(Buffer.from([
      0x99, 0x98, 0x97, 0x96
    ]))).to.throw(/Incorrect header/)

    expect(() => decode(Buffer.from([
      0x10, 0x02, 0x99, 0x98, 0x97, 0x96
    ]))).to.throw(/Unexpected end of packet/)

    expect(() => decode(Buffer.from([
      0x10, 0x02, 0x10, 0x04, 0x10, 0x03
    ]))).to.throw(/Found 4 where 3 or 10 was expected/)
  })
})