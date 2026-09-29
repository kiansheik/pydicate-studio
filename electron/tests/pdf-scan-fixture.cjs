'use strict';

// A scan-shaped fixture: every page is one full-page raster image, like the
// historical digitisations contributors attach. Page 1 uses JPXDecode
// (JPEG 2000) and page 2 DCTDecode (JPEG), so a blank page 1 beside a drawn
// page 2 isolates a missing image codec from a broken document pipeline.
//
// Both images are the same 64x64 picture: a dark red left half and a blue band
// on the right half. Regenerate with Pillow:
//   img.save(out, format='JPEG2000', irreversible=False, quality_mode='lossless')
//   img.save(out, format='JPEG', quality=90)

const JPX = Buffer.from(
  'AAAADGpQICANCocKAAAAFGZ0eXBqcDIgAAAAAGpwMiAAAAAtanAyaAAAABZpaGRyAAAAQAAAAEAAAwcHAAAAAAAPY29scgEA' +
    'AAAAABAAAAP0anAyY/9P/1EALwAAAAAAQAAAAEAAAAAAAAAAAAAAAEAAAABAAAAAAAAAAAAAAwcBAQcBAQcBAf9SAAwAAAAB' +
    'AAUEBAAB/1wAE0BASEhQSEhQSEhQSEhQSEhQ/2QAJQABQ3JlYXRlZCBieSBPcGVuSlBFRyB2ZXJzaW9uIDIuNS40/5AACgAA' +
    'AAADbQAB/5PfgCgNhhfF09+AMAd9zFsfv9+AKAlCb6Emx9oLPwBY/AGADRCme9cPq9fr6w9AgnTZf8/AGn4A0PtBgA0xGY1a' +
    'nw+sQybhLwua90TKP8faCw+oEgfOFAgRdw1/D6vX3Qua90k/x9oXD6gyB84oGVoZTkQ2wsv9Xd8ehlqU2/qDHfW8738Yqi3O' +
    'v2vS30evx9oZD6gyB84oFwVHaBR+x5A+d8gvI3nWDc2+BmTWTMs/GKouetqzmFDsP8faFQPkEQD4Rhcq4R2eYflhQe8jedYE' +
    'sWk/ZRY4I0KBT8faJx9o1B9QcEtNKUUineYDu5Mp2i3iFJttFD8orrJ9eebbZx+iyC3xbLwWJPficLZjedyLDyLqf1jWRHnQ' +
    'r3li1v1fz8BSPtGIPqDAIvTvFtFwOCNcWH+eUjs/RlATV/korrJ9oP00tmVjCZ2t3S+smjtiBn1CaAQi6n8/8yHni8XFPtPH' +
    '2icHzk4D5BYhbfE8w2tjtfr2rGLvlQSYwK2fKK6yfXnm22g/fmyADmYTDsD3ryLqf1jWRHnQr3lfx9o5PwHofaHAgxQfNmIl' +
    'EvzeDQCFMPw7wnRQT2GduCTmDEs6f4Su/o5O2LRxhkiI0VCd8WEEABKCIYDK0JXe++2GB4JkpYP306//VkwVZHOPz8B+PtHY' +
    'faGgNfHuaIjR0sq3K4WVxtUWrc2rgEhBKJnjzsCaOQRAdoOegKJbOO7I/01eQO7lyeLbH9n9Gv1T2DQVSmlCgmSlg/fXC+Lj' +
    'Igndr8/Aah9QxA+cUDXx7miRcakZBruxS9KKHJsccLzZukDhBonXhLOIXiCgdioAyrDSPhqwCJxOjqrhNusDgmSlg/fTuUJc' +
    'D8faNx9o7B9QOMgpWQXFcwHr5PjIJc8jRDGAFMjBDhHKN5b0Ob+8KoAANfbPLVhe0juwgI/dWMKEgEWxQwhvhy1TvpsT9gKo' +
    'b8/Aij7SCD6gcL6bfPOQxcKuZ8xprYIrl336evyYr0pYT7C4BWQ1MqoK6n+/vCqAADX4zWXIeM3E0jCAj/IBANjBfQnYQvwL' +
    'D5sQf76bE/YDZg/H2jcHzmYD5A5e+sU/hLaN4H+gYBbNClRILBKD9cFdREDQV1O/vCqAADX2kFDzGM1AGBkRPOQQc1o/PsSf' +
    'vpsT9gKof//Z',
  'base64',
);
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQ' +
    'ERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU' +
    'FBQUFBQUFBQUFBQUFBT/wAARCABAAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAA' +
    'AgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6' +
    'Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXG' +
    'x8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREA' +
    'AgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5' +
    'OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPE' +
    'xcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5fooor83P7VCiiigD986KKK/SD+Kgoooo' +
    'A/Ayiiivzc/tUKKKKAP3zor+eGiv63/4hp/1Gf8AlP8A+3P4L/tX+5+P/AP6HqK/nhoo/wCIaf8AUZ/5T/8Atw/tX+5+P/AO' +
    'rooor+SD+9AooooA5Siv6HqK/rf/AIiX/wBQf/lT/wC0P4L/ALK/v/h/wT+eGiv6HqKP+Il/9Qf/AJU/+0D+yv7/AOH/AAT8' +
    'DKKKK/kg/vQKKKKAP3zooor9IP4qCiiigD//2Q==',
  'base64',
);
const WIDTH = 64,
  HEIGHT = 64,
  PAGE = [400, 600];

function stream(dictionary, data) {
  return Buffer.concat([
    Buffer.from(`<< ${dictionary} /Length ${data.length} >>\nstream\n`),
    data,
    Buffer.from('\nendstream'),
  ]);
}
function image(filter, data) {
  return stream(
    `/Type /XObject /Subtype /Image /Width ${WIDTH} /Height ${HEIGHT}` +
      ` /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter ${filter}`,
    data,
  );
}

/** Two pages of scanned imagery, page 1 JPEG 2000 and page 2 JPEG. */
function makeScanPdfFixture() {
  const content = Buffer.from(`q ${PAGE[0]} 0 0 ${PAGE[1]} 0 0 cm /Im0 Do Q\n`);
  const page = (contents, resource) =>
    Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE[0]} ${PAGE[1]}]` +
        ` /Contents ${contents} 0 R /Resources << /XObject << /Im0 ${resource} 0 R >> >> >>`,
    );
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>'),
    page(5, 6),
    page(5, 7),
    stream('', content),
    image('/JPXDecode', JPX),
    image('/DCTDecode', JPEG),
  ];
  const parts = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets = [];
  let length = parts[0].length;
  objects.forEach((object, index) => {
    offsets.push(length);
    const body = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`),
      object,
      Buffer.from('\nendobj\n'),
    ]);
    parts.push(body);
    length += body.length;
  });
  let table = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) table += `${String(offset).padStart(10, '0')} 00000 n \n`;
  table += `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${length}\n%%EOF\n`;
  parts.push(Buffer.from(table));
  return Buffer.concat(parts);
}

module.exports = { makeScanPdfFixture };
