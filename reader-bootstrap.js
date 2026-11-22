// Open the reader on its canonical secure origin, including bare-address visits.
if (location.protocol === 'http:' && location.hostname === 'ysg.lawinus.org') {
  const secure = new URL(location.href);
  secure.protocol = 'https:';
  location.replace(secure.href);
}
