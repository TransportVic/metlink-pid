import { expect } from 'chai'
import { DisplayMessage, PageAnimate } from '../index.mjs'

describe('The DisplayMessage class', () => {
  describe('The fromStr method', () => {
    it('Should take a list of pages split by | and convert them into Page objects', () => {
      let message = DisplayMessage.fromStr('12:34 FUNKYTOWN~5_Limited Express|_Stops all stations except East Richard')
      expect(message.getPages().length).to.equal(2)
      expect(message.getPages()[0].getAnimate().toString()).to.equal(PageAnimate.VSCROLL.toString())
      expect(message.getPages()[0].getDelay()).to.equal(40)
      expect(message.getPages()[0].getText()).to.equal('12:34 FUNKYTOWN~5_Limited Express')

      expect(message.getPages()[1].getAnimate().toString()).to.equal(PageAnimate.HSCROLL.toString())
      expect(message.getPages()[1].getDelay()).to.equal(0)
      expect(message.getPages()[1].getText()).to.equal('_Stops all stations except East Richard')
    })
  })

  describe('The fromBytes method', () => {
    it('Should check for the correct header', () => {
      let badHeader = Buffer.from([ 0x00, 0x43, 0x00 ])
      let goodHeader = Buffer.from([ 0x02, 0x44, 0x00 ])
      expect(() => DisplayMessage.fromBytes(badHeader, 0x00)).to.throw(/Incorrect header/)
      expect(() => DisplayMessage.fromBytes(goodHeader, 0x02)).to.not.throw()
    })

    it('Should split the pages using 0x0D and 0x01', () => {
      let bytes = Buffer.from([
        0x00, 0x44, 0x00, // header
        
        /* First page */
        0x1D, // animate byte
        0x01, // offset byte
        35, // delay byte
        0x00,
        0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64, // Text data

        0x0D, 0x01, // page separator

        /* Second page */
        0x1D, // animate byte
        0x00, // offset byte
        20, // delay byte
        0x00,
        0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64, // Text data

        0x0D // End of second page
      ])

      let message = DisplayMessage.fromBytes(bytes, 0x00)
      expect(message.getPages().length).to.equal(2)
      expect(message.getPages()[0].getAnimate().toString()).to.equal(PageAnimate.VSCROLL.toString())
      expect(message.getPages()[0].getDelay()).to.equal(35)
      expect(message.getPages()[0].getText()).to.equal('_Hello World')

      expect(message.getPages()[1].getAnimate().toString()).to.equal(PageAnimate.VSCROLL.toString())
      expect(message.getPages()[1].getDelay()).to.equal(20)
      expect(message.getPages()[1].getText()).to.equal('Hello World')
    })

    it('Should raise an unexpected byte value error if a page is not started with 0x01', () => {
      let bytes = Buffer.from([
        0x00, 0x44, 0x00, // header
        
        /* First page */
        0x1D, // animate byte
        0x01, // offset byte
        35, // delay byte
        0x00,
        0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64, // Text data

        0x0D, // page separator missing 0x01

        /* Second page */
        0x1D, // animate byte
        0x00, // offset byte
        20, // delay byte
        0x00,
        0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64, // Text data

        0x0D // End of second page
      ])

      expect(() => DisplayMessage.fromBytes(bytes, 0x00)).to.throw(/Unexpected byte value/)
    })

    it('Should raise an unexpected end of data if the page is not terminated with 0x0D', () => {
      let bytes = Buffer.from([
        0x00, 0x44, 0x00, // header
        
        /* First page */
        0x1D, // animate byte
        0x01, // offset byte
        35, // delay byte
        0x00,
        0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64, // Text data

        0x0D, 0x01, // page separator

        /* Second page */
        0x1D, // animate byte
        0x00, // offset byte
        20, // delay byte
        0x00,
        0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64 // Text data
      ])

      expect(() => DisplayMessage.fromBytes(bytes, 0x00)).to.throw(/Unexpected end of data/)
    })
  })
})