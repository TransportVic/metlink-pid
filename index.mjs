import { SerialPort } from 'serialport'
import { crc, verify } from './crc.mjs'
import { decode, encode } from './dlestxetx.mjs'

/**
 * The `PageAnimate` class holds constants
    for types of entry animations available to `Pages <Page>`.

    Each constant has a string value
    which is used when converting `Page` objects to & from strings.

    The documentation for each constant
    describes each available animation and any relevant considerations.
 */
export class PageAnimate {
  /**
   * Appear instantly.
    
    Text not fitting on the display is clipped and never seen.
    
    Page delay commences immediately.
   */
  static NONE = new PageAnimate('N')

  /**
   * Scroll vertically into view from the bottom,
    and remain on the display.
    
    Text not fitting on the display is clipped and never seen.
    
    Page delay commences as soon as the text is fully displayed.
   */
  static VSCROLL = new PageAnimate('V')

  /**
   * Scroll horizontally into view from the right,
    simultaneously scrolling the previous page out of view to the left,
    then scroll out of view to the left.
    
    Page delay commences after all scrolling text becomes fully invisible,
    so usually a delay of ``0`` is desired in conjunction with `HSCROLL`.
   */
  static HSCROLL = new PageAnimate('H')

  #animate

  constructor(type) {
    this.#animate = type.toUpperCase()
  }

  toString() {
    return this.#animate
  }
}

export class Page {

  #animate
  #delay
  #text

  /** A mapping from permissible ASCII/Unicode characters
  to the equivalent display-level byte. */
  static _TEXT_ENCODING = {
    ...(" !#$&'()*+,-./0123456789:;<=>?ABCDEFGHIJKLMNOPQRSTUVWXYZ\\abcdefghijklmnopqrstuvwxyz".split('').reduce((acc, e) => {
      acc[e] = e.charCodeAt(0)
      return acc
    }, {})),
    '\u00B7': 0x8F,  // MIDDLE DOT
    '\u2022': 0xD3,  // BULLET
    '\u2500': 0x97,  // BOX DRAWINGS LIGHT HORIZONTAL
    '\u2501': 0xD2,  // BOX DRAWINGS HEAVY HORIZONTAL
    '\u2588': 0x5F,  // FULL BLOCK
    '\u2594': 0xA3,  // UPPER ONE EIGHTH BLOCK
  }

  /**
   * A mapping from display-level bytes
    to the equivalent ASCII/Unicode character.
    
    In some cases, multiple display-level bytes map to a common ASCII/Unicode character:
    
    *   Bytes ``"`` and ``'`` map to character ``'``
        (which means ``"`` can't be permitted as an input character).
    *   Bytes ``\xA3``, ``\xA4``, and ``\xA5`` map to character ``▔``.
    
    Although not problematic,
    this makes perfect round-tripping between characters and display bytes impossible,
    so it should never be assumed to be possible.
   */
  static _TEXT_DECODING = {
    ...(Object.keys(this._TEXT_ENCODING).reduce((acc, e) => {
      acc[this._TEXT_ENCODING[e]] = e
      return acc
    }, {})),
    0x98: '\u2500',
    0xA4: '\u2594',
    0xA5: '\u2594',
  }

  static _ATTRS_SEP = '^'
  static _RIGHT_CHAR_DECODED = '~'
  static _RIGHT_CHAR_ENCODED = '\\R'
  static _NEWLINE_CHAR = '_'
  static _NEWLINE_BYTESEQ = 0x0A
  static _STR_RE = /^(?:(?<animate>[A-Za-z]?)(?<delay>\d*)\^)?(?<text>.*)$/s

  static _ANIMATE_ENCODING = {
    [PageAnimate.NONE]: 0x00,
    [PageAnimate.VSCROLL]: 0x1D,
    [PageAnimate.HSCROLL]: 0x2F
  }

  static _ANIMATE_DECODING = {
    ...(Object.keys(this._ANIMATE_ENCODING).reduce((acc, e) => {
      acc[this._ANIMATE_ENCODING[e]] = e
      return acc
    }, {}))
  }

  static _CHARS_BY_WIDTH = {
    2: '\'',
    3: '.!,()',
    4: 'I1: il<>;',
    5: '0-jk?-=',
    6: 'ABCDEFGHJKLMNOPQRSTUVWXYZ23456789abcdefghmnopqrstuvwxyz/\\*&'
  }

  static _WIDTHS_BY_CHAR = {
    0x8F: 2,  // · 'MIDDLE DOT'
    0xD3: 3,  // • 'BULLET'
    0x97: 6,  // ─ 'BOX DRAWINGS LIGHT HORIZONTAL'
    0xD2: 6,  // ━ 'BOX DRAWINGS HEAVY HORIZONTAL'
    0x5F: 6,  // █ 'FULL BLOCK'
    0xA3: 6,  // ▔ 'UPPER ONE EIGHTH BLOCK'
    ...(Object.keys(this._CHARS_BY_WIDTH).reduce((acc, widthKey) => {
      let chars = this._CHARS_BY_WIDTH[widthKey]
      let width = parseInt(widthKey)
      for (let char of chars) acc[char] = width

      return acc
    }, {}))
  }

  static _DISPLAY_WIDTH = 120

  /**
   A :`Page` object represents one "screen" of information in a `DisplayMessage`.

    Each `Page` object holds the text to be displayed,
    how the text animates on entry,
    and how long the page should "pause"
    between completion of the animation and display of the next page.

    `Page` objects are not typically constructed directly.
    Instead, they usually come to exist through construction of `DisplayMessage` objects.

    @param {PageAnimate} animate the type of animation to take place on page entry, given as a `PageAnimate` constant.

    @param {int} delay the length of time (approximately in seconds) to delay display of the next page after animation completes, given as an `int` between ``0`` and ``64`` inclusive.

    @param {string} text the text to display on the page. All ASCII letters & numbers, the ASCII space character, and these other printable ASCII characters can be used freely:
               ```
            (+)     (0)(1)(2)(3)(4)(5)(6)(7)(8)(9)(A)(B)(C)(D)(E)(F)

            (0x20)      !     #  $     &  '  (  )  *  +  ,  -  .  /
            (0x30)                                 :  ;  <  =  >  ?
            (0x50)                                       \\
            ```

        as well as some Unicode characters::
```
            (+)       (0)(1)(2)(3)(4)(5)(6)(7)(8)(9)(A)(B)(C)(D)(E)(F)

            (0x00B0)                        ·
            (0x2020)         •
            (0x2500)   ─  ━
            (0x2580)                           █
            (0x2590)               ▔
            ```
        Notably, some printable ASCII characters **cannot** be used::
               ```
            (+)     (0)(1)(2)(3)(4)(5)(6)(7)(8)(9)(A)(B)(C)(D)(E)(F)

            (0x20)         "        %
            (0x40)   @
            (0x50)                                    [     ]  ^  _
            (0x60)   `
            (0x70)                                    {  |  }  ~  
            ```

        Some of these unusable characters are instead utilised for other purposes:

        *   Use ``~`` to right-justify the remaining text on the line.
        *   Use ``_`` to advance to the next line of the display.

        A few more of these characters
        are utilised by the various `Page` & `DisplayMessage` string methods
        to enable compact, easily-typed, pure-string representations containing all attributes.

    :raise ValueError:
        if the text contains unusable characters,
        or if a valid `PageAnimate` value is not given,
        or if the delay is outside the permissible range.
    """
   */
  constructor(animate, delay, text) {
    this.#animate = animate
    this.#delay = delay
    this.#text = text
  }

  getAnimate() { return this.#animate }
  getDelay() { return this.#delay }
  getText() { return this.#text }

  /**
  Construct a `Page` object from a string representation.

  @param {string} string a string in one of the following formats:
      -   ``<text>``
      -   ``^<text>``
      -   ``<animate>^<text>``
      -   ``<delay>^<text>``
      -   ``<animate><delay>^<text>``

      where:

      -   ``<animate>`` is the string value of the desired `PageAnimate` value
          (e.g. ``N`` for `PageAnimate.NONE`);
      -   ``<delay>`` is the desired ``delay`` value; and
      -   ``<text>`` is the desired ``text`` value.

      For reference, such a string can also be obtained
      by converting an existing `Page` object to a string using the .toString() method:

      > new Page(PageAnimate.VSCROLL, 40, '12:34 FUNKYTOWN\~5_Limited Express').toString()
      'V40^12:34 FUNKYTOWN\~5_Limited Express'

  @param {string} [default_animate=PageAnimate.NONE] the ``animate`` value to use if one is not provided in the string. Defaults to `PageAnimate.NONE`.

  @param {number} [default_delay=5] the ``delay`` value to use if one is not provided in the string. Defaults to ``5``.

  :raise ValueError:
      if the text contains unusable characters,
      or if a valid `PageAnimate` value is not given,
      or if the delay is outside the permissible range. */
  static fromStr(string, default_animate = PageAnimate.NONE, default_delay = 5) {
    let match = string.match(this._STR_RE)
    let animate = default_animate
    let delay = default_delay

    if (match.groups.animate) animate = new PageAnimate(match.groups.animate)
    if (match.groups.delay) delay = parseInt(match.groups.delay)

    return new Page(animate, delay, match.groups.text)

  }

  /**
    Gets The string representation of this object.

    @returns {string} A string, that when passed to `Page.from_str` will yield an equivalent `Page` object to this one.
   */
  toString() {
    return this.#animate.toString() + this.#delay + this.constructor._ATTRS_SEP + this.#text
  }

  /**
    The raw byte representation of the `Page` as understood by the display.

    Used by `DisplayMessage.toBytes`
    when preparing to `PID.send()` a complete `DisplayMessage` to the display.
   */
  toBytes() {
    let animateByte = this.constructor._ANIMATE_ENCODING[this.#animate.toString()]
    let offsetByte = this.#text.match(/^(_+)/)?.[0].length || 0
    let delayByte = this.#delay * 4
    let textBytes = this.#text.slice(offsetByte).split(this.constructor._NEWLINE_CHAR)
      .map(line => {
        if (!line.includes(this.constructor._RIGHT_CHAR_DECODED)) return this.constructor.encodeText(line)
        let [ left, right ] = line.split(this.constructor._RIGHT_CHAR_DECODED)

        let leftWidth = this.#pixelWidth(left)
        let rightWidth = this.#pixelWidth(right)
        let paddingWidth = this.constructor._DISPLAY_WIDTH - 2 - leftWidth - rightWidth
        let padding = ''
        let spaceWidth = this.constructor._WIDTHS_BY_CHAR[' ']

        while (paddingWidth >= spaceWidth) {
          padding += ' '
          paddingWidth -= spaceWidth
        }

        while (paddingWidth-- > 0) padding += '\xff'

        return Buffer.from([
          ...this.constructor.encodeText(left),
          ...Buffer.from(padding, 'binary'),
          ...this.constructor.encodeText(right)
        ])
      })
      .reduce((acc, e) => [...acc, this.constructor._NEWLINE_BYTESEQ, ...e], []).slice(1)

    return Buffer.from([
      animateByte,
      offsetByte,
      delayByte,
      0x00,
      ...textBytes
    ])
  }

  #pixelWidth(string) {
    let width = 0
    for (let char of string) {
      if (!(char in this.constructor._WIDTHS_BY_CHAR)) throw new RangeError(`Unknown width for character ${char}`)
      width += this.constructor._WIDTHS_BY_CHAR[char]
    }
    return width
  }

  static fromBytes(bytes) {
    if (bytes.length < 4) throw new RangeError('Not enough bytes for a Page')
    if (!(bytes[0] in this._ANIMATE_DECODING)) throw new RangeError(`Unexpected animate byte value ${bytes[0].toString(16)} at index 0`)
    let animate = this._ANIMATE_DECODING[bytes[0]]
    let offset = bytes[1]
    let delay = Math.round(bytes[2] / 4)

    if (bytes[3] !== 0x00) throw new RangeError(`unexpected byte value ${bytes_in[3].toString(16)} at index 3`)

    let rawText = [ ...bytes.subarray(4) ]
    while (rawText[rawText.length - 1] === this._NEWLINE_BYTESEQ) rawText.pop() // Right trim the newline characters
    let lines = []
    let line = []
    for (let char of rawText) {
      if (char === this._NEWLINE_BYTESEQ) {
        lines.push(line)
        line = []
      } else line.push(char)
    }

    lines.push(line)

    let text = Array(offset).fill(this._NEWLINE_CHAR).join('') + lines
      .map(line => this.decodeText(line).replace(/ +$/).replace(this._RIGHT_CHAR_ENCODED, this._RIGHT_CHAR_DECODED))
      .join(this._NEWLINE_CHAR)

    return new Page(animate, delay, text)
  }

  /**
   Convert a string of characters into a string of display-level bytes. Called from the `to_bytes` method.
   * @param {string} text The string for display
   */
  static encodeText(text) {
    let bytesOut = Array(text.length)
    let badChars = new Set()

    for (let i = 0; i < text.length; i++) {
      let char = text[i]
      if (char in this._TEXT_ENCODING) {
        bytesOut[i] = this._TEXT_ENCODING[char]
      } else {
        badChars.add(char)
      }
    }

    if (badChars.length > 0) throw new RangeError(`${badChars.entries().join(', ')} not in allowed characters`)
    return bytesOut
  }

  static decodeText(bytes) {
    let text = ''
    for (let byte of bytes) {
      if (byte in this._TEXT_DECODING) text += this._TEXT_DECODING[byte]
      else text += '\uFFFD'
    }

    return text
  }

}

/**
  The `Message` class is an :term:`abstract base class`
  of the `DisplayMessage`, `PingMessage`, and `ResponseMessage` classes.
  Its existence allows for simplified implementation & return typing of the `inspect` function.
*/
export class Message {

  /**
    The `bytes` that a raw byte representation must start with in order to possibly be an instance of this `Message` subclass.
   * @param {int} address The address of the target device this `Message` is for
   */
  static marker(address) {}

  /**
    Constructs an instance of this `Message` subclass from a raw byte representation (not including the CRC-checksumming and packet-framing required for transmission).
   * @param {Buffer} bytes A sequence of bytes forming the message
   * @param {int} address The address of the device the bytes were read from
   */
  static fromBytes(bytes, address) {}

  /**
    Construct a raw byte representation of this `Message` subclass (not including the CRC-checksumming and packet-framing required for transmission).
   */
  toBytes() {}

}

/**
  A `PingMessage` exists as `Message` to send to the display with no visual effect,
  but which impedes the automatic clearing of the display
  (which otherwise occurs after approximately one minute of inactivity).

  `PingMessage` objects are exclusively constructed and sent by the `PID.ping` method,
  but they exist as a class in case their raw byte representations are passed to the `inspect` function.
 */
export class PingMessage extends Message {

  #unspecified_byte
  #address

  /**
   * Constructs a new PingMessage.
   * 
   * @param {int} unspecified_byte A byte that seems to have no effect if changed, but in deployment is typically ``0x6F``.
   * @param {int} address The device address the message is intended for
   */
  constructor(unspecified_byte=0x6F, address=0x01) {
    super()
    this.#unspecified_byte = unspecified_byte
    this.#address = address
  }

  static marker(address) {
    return [ address, 0x50 ]
  }

  static fromBytes(bytes, address) {
    if (bytes.length < 3) throw new RangeError('Unexpected end of data')
    if (bytes.length > 3) throw new RangeError('Unexpected data')

    let expectedMarker = this.marker(address)
    if (!(bytes[0] === expectedMarker[0] && bytes[1] === expectedMarker[1])) throw new RangeError('Incorrect header for PingMessage')
    return new PingMessage(bytes[2], address)
  }

  toBytes() {
    return [
      ...this.constructor.marker(this.#address),
      this.#unspecified_byte
    ]
  }

}

/**
  A `ResponseMessage` represents a response received from the display
  after a transmission to it.

  `ResponseMessage` objects are not intended to be sent to the display.
  They exist as a class in order to be recognised by the `inspect` function,
  which is used internally by `PID.send` to verify acknowledgement from the display
  following the sending of a message.
 */
export class ResponseMessage extends Message {

  #unspecified_byte
  #address

  /**
   * Constructs a new ResponseMessage.
   * 
   * @param {int} unspecified_byte a variable byte that usually somewhat seems to be related to the ``unspecified_byte`` value of the previously-sent `PingMessage`, but not always, so it is captured but otherwise ignored.
   * @param {int} address The device address the message is intended for
   */
  constructor(unspecified_byte, address=0x01) {
    super()
    this.#unspecified_byte = unspecified_byte
    this.#address = address
  }

  static marker(address) {
    return [ address, 0x52 ]
  }

  static fromBytes(bytes, address) {
    if (bytes.length < 4) throw new RangeError('Unexpected end of data')
    if (bytes.length > 4) throw new RangeError('Unexpected data')

    let expectedMarker = this.marker(address)
    if (!(bytes[0] === expectedMarker[0] && bytes[1] === expectedMarker[1])) throw new RangeError('Incorrect header for ResponseMessage')
    if (bytes[3] !== 0x00) throw new RangeError(`Unexpected value ${bytes[3].toString(16)} at position 3`)

    return new ResponseMessage(bytes[2], address)
  }

  toBytes() {
    return [
      ...this.constructor.marker(this.#address),
      this.#unspecified_byte,
      0x00
    ]
  }

}

/**
  A `DisplayMessage` object represents a single, cohesive set of information
  displayed over a sequence of `Page`s.
  Once the sequence is exhausted, it repeats indefinitely
  until a new message is sent to the display
  (or the display times out & clears,
  which can be avoided by calling `.ping()` on the display).

  `DisplayMessage` objects are typically built from a string using `DisplayMessage.fromStr`
  rather than constructed directly.
 */
export class DisplayMessage extends Message {

  #pages
  #address

  static _PAGE_SEP = '|'
  static _PAGE_END = 0x0D
  static _PAGE_START = 0x01

  constructor(pages, address) {
    super()
    this.#pages = pages
    this.#address = address
  }

  /**
   * 
   * @returns {Page[]}
   */
  getPages() { return this.#pages.slice(0) }

  static marker(address) {
    return [ address, 0x44, 0x00 ]
  }

  /**
    Construct a `DisplayMessage` object from a string representation.

    @param {string} string a string in one of the following formats:
    -   ``<page_str>``
    -   ``<page_str>|<page_str>``
    -   ``<page_str>|<page_str>|<page_str>``
    -   *(etc)*

    where each ``<page_str>`` is a string representation of a `Page` object,
    as accepted by `Page.from_str`,
    and is separated from other `Page` representations by ``|``.

    For reference, such a string can also be obtained
    by converting an existing `DisplayMessage` object to a string
    using `str() <str>`:

    >>> page1 = Page(animate=PageAnimate.VSCROLL, delay=10, text='12:34 FUNKYTOWN~5_Limited Express')
    >>> page2 = Page(animate=PageAnimate.HSCROLL, delay=0, text='_Stops all stations except East Richard')
    >>> str(DisplayMessage([page1, page2]))
    'V10^12:34 FUNKYTOWN~5_Limited Express|H0^_Stops all stations except East Richard'

    Where any page string fails to specify an ``animate`` or ``delay`` value,
    these defaults will be applied:

    - `Animate.VSCROLL` & ``delay=10`` for the first page; and
    - `Animate.HSCROLL` & ``delay=0`` for subsequent pages.

    @param {int} address The device address this DisplayMessage is intended for

    :raise ValueError:
      if the text of any page contains unusable characters,
      or if a valid Animate value is not given,
      or if the delay is outside the permissible range.
   */
  static fromStr(string, address) {
    return new DisplayMessage(
      string.split(this._PAGE_SEP)
      .map((string, i) => Page.fromStr(
        string,
        i === 0 ? PageAnimate.VSCROLL : PageAnimate.HSCROLL,
        i === 0 ? 10 : 0
      )),
      address
    )
  }

  static fromBytes(bytes, address) {
    let expectedMarker = this.marker(address)
    if (!(bytes[0] === expectedMarker[0] && bytes[1] === expectedMarker[1] && bytes[2] === expectedMarker[2])) throw new RangeError('Incorrect header for DisplayMessage')
    let startIndex = expectedMarker.length
    let pages = []
    let page = []

    for (let index = startIndex; index < bytes.length; index++) {
      let byte = bytes[index]
      if (byte == this._PAGE_END) { // end of page marker
        if (!page.length) throw new RangeError(`Unexpected byte value ${byte} at index ${index}`)
        pages.push(page)
        page = []
        // Readahead to get the next PAGE_START if available

        if (index < bytes.length - 1 && bytes[++index] !== this._PAGE_START) {
          throw new RangeError(`Unexpected byte value ${byte} at index ${index}`)
        }
      } else page.push(byte)
    }

    if (page.length) throw new RangeError('Unexpected end of data')

    return new DisplayMessage(pages.map(page => Page.fromBytes(Buffer.from(page))), address)
  }

  toString() {
    return this.#pages.map(page => page.toString()).join(this.constructor._PAGE_SEP)
  }

  toBytes() {
    let pageBytes = this.#pages
      .map(page => page.toBytes())
      .reduce((acc, e) => [...acc, this.constructor._PAGE_END, this.constructor._PAGE_START, ...e] ,[]).slice(2)

    return Buffer.from([
      ...this.constructor.marker(this.#address),
      ...pageBytes,
      this.constructor._PAGE_END
    ])
  }

}

/**
  A `PID` object represents a serial connection to a physical display.

  `PID` objects are typically constructed using the `PID.forDevice` class method,
  and can send messages in the form of `Message` objects, strings, or raw `bytes`
  using the `send` method.
  It is possible to `ping` the display at regular intervals
  to persist the currently-displayed message.

  `PID` objects also manage the CRC checksumming & DLE/STX/ETX packet framing
  used by the display in what it receives & transmits,
  and ensure that every instruction sent to the display
  is acknowledged.

 */
export class PID {

  #serial
  #ignoreResponses
  #address

  #readBuffer

  /**
   * Constructs a new PID instance.
   * 
   * @param {SerialPort} serial a `serialport.SerialPort` object. In normal use a correctly configured one is set by `PID.forDevice`.
   * @param {boolean} [ignoreResponses=false] whether to ignore the response from the PID whenever `PID.send` is called. Defaults to ``false``.
   * @param {int} [address=0x01] the address of the PID. Allows for one controller to control multiple PIDs.
   */
  constructor(serial, ignoreResponses = false, address = 0x01) {
    this.#serial = serial
    this.#ignoreResponses = ignoreResponses
    this.#address = address

    this.#readBuffer = []

    serial.on('data', data => {
      let parsedData = [ ...data ].map(char => (0xFF - char) >> 1)
      this.#readBuffer.push(...parsedData)
    })
  }

  /**
    Construct a `PID` object connected to the specified serial device
    with a correctly configured `serialport.Serial` object.

    The `serialport.Serial` object is configured to time out after 500ms
    during read operations,
    which is ample time for the display to send acknowledgement
    after being written to.

   * @param {string} port the serial device name, such as ``/dev/ttyUSB0`` on Linux or ``COM1`` on Windows.
    The correct device name can be found on Linux by unplugging and re-plugging the display connection,
    running ``dmesg``, and inspecting the output for the device name.
   * @param {boolean} [ignoreResponses] whether to ignore the response from the PID whenever `PID.send` is called. Defaults to ``false``.
   * @param {int} [address] the address of the PID. Allows for one controller to control multiple PIDs.
   */
  static forDevice(port, ignoreResponses, address) {
    return new PID(
      new SerialPort({ path: port, baudRate: 9600 }),
      ignoreResponses,
      address
    )
  }

  /**
  Send data to the display---most typically message data,
  although any `bytes` data can be sent.

  -   If a string is provided,
      it is converted to a `DisplayMessage` object using `DisplayMessage.fromStr`,
      then `DisplayMessage.toBytes`,
      then CRC-checksummed and packet-framed before sending.

  -   If a `Message` object is provided
      (usually a `DisplayMessage` but sometimes a `PingMessage`),
      it is converted `Message.toBytes`,
      then CRC-checksummed and packet-framed before sending.

  -   If a `bytes` object is provided that **is not** a valid DLE/STX/ETX packet
      (``\\x10\\x02 ··· \\x10\\x03``),
      the bytes are CRC-checksummed and packet-framed before sending.

  -   If a `bytes` object is provided that **is** a valid DLE/STX/ETX packet,
      the packet is assumed to already contain a correct CRC checksum
      and sent without change.

   * @param {*} data a string, `Message` object, or `Buffer` object.
   */
  async send(data) {
    if (typeof data === 'string') data = DisplayMessage.fromStr(data, this.#address)
    if (data instanceof Message) data = data.toBytes()

    try {
      decode(data)
    } catch (e) {
      data = encode(Buffer.from([ ...data, ...crc(data) ]))
    }

    this.#serial.write(data)
    await new Promise(r => this.#serial.drain(r))

    if (!this.#ignoreResponses) {
      await new Promise(r => setTimeout(r), 100)
      let response = verify(decode(Buffer.from(this.#readBuffer)))
      this.#readBuffer = []
    }
  }

  async ping() {
    await this.send(new PingMessage(undefined, this.#address))
  }

  async close() {
    await new Promise(r => this.#serial.close(r))
  }
}