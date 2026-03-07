// USPS Publication 28 - Address Standardization
// https://pe.usps.com/text/pub28/welcome.htm
//
// Normalizes street suffixes, directional words, and secondary unit
// designators to their official USPS abbreviations.

const STREET_SUFFIXES = {
  alley: 'ALY', ally: 'ALY', aly: 'ALY',
  annex: 'ANX', anex: 'ANX', annx: 'ANX', anx: 'ANX',
  arcade: 'ARC', arc: 'ARC',
  avenue: 'AVE', av: 'AVE', ave: 'AVE', aven: 'AVE', avenu: 'AVE', avn: 'AVE', avnue: 'AVE',
  bayou: 'BYU', bayoo: 'BYU', byu: 'BYU',
  beach: 'BCH', bch: 'BCH',
  bend: 'BND', bnd: 'BND',
  bluff: 'BLF', blf: 'BLF', bluf: 'BLF',
  bluffs: 'BLFS', blfs: 'BLFS',
  bottom: 'BTM', bot: 'BTM', btm: 'BTM', bottm: 'BTM',
  boulevard: 'BLVD', blvd: 'BLVD', boul: 'BLVD', boulv: 'BLVD',
  branch: 'BR', br: 'BR', brnch: 'BR',
  bridge: 'BRG', brdge: 'BRG', brg: 'BRG',
  brook: 'BRK', brk: 'BRK',
  brooks: 'BRKS', brks: 'BRKS',
  burg: 'BG', bg: 'BG',
  burgs: 'BGS', bgs: 'BGS',
  bypass: 'BYP', byp: 'BYP', byps: 'BYP', bypas: 'BYP',
  camp: 'CP', cp: 'CP', cmp: 'CP',
  canyon: 'CYN', canyn: 'CYN', cnyn: 'CYN', cyn: 'CYN',
  cape: 'CPE', cpe: 'CPE',
  causeway: 'CSWY', cswy: 'CSWY', causwa: 'CSWY',
  center: 'CTR', cen: 'CTR', cent: 'CTR', centr: 'CTR', centre: 'CTR', cnter: 'CTR', cntr: 'CTR', ctr: 'CTR',
  centers: 'CTRS', ctrs: 'CTRS',
  circle: 'CIR', cir: 'CIR', circ: 'CIR', circl: 'CIR', crcl: 'CIR', crcle: 'CIR',
  circles: 'CIRS', cirs: 'CIRS',
  cliff: 'CLF', clf: 'CLF',
  cliffs: 'CLFS', clfs: 'CLFS',
  club: 'CLB', clb: 'CLB',
  common: 'CMN', cmn: 'CMN',
  commons: 'CMNS', cmns: 'CMNS',
  corner: 'COR', cor: 'COR',
  corners: 'CORS', cors: 'CORS',
  course: 'CRSE', crse: 'CRSE',
  court: 'CT', ct: 'CT',
  courts: 'CTS', cts: 'CTS',
  cove: 'CV', cv: 'CV',
  coves: 'CVS', cvs: 'CVS',
  creek: 'CRK', crk: 'CRK',
  crescent: 'CRES', cres: 'CRES', crsent: 'CRES', crsnt: 'CRES',
  crest: 'CRST', crst: 'CRST',
  crossing: 'XING', crssng: 'XING', xing: 'XING',
  crossroad: 'XRD', xrd: 'XRD',
  crossroads: 'XRDS', xrds: 'XRDS',
  curve: 'CURV', curv: 'CURV',
  dale: 'DL', dl: 'DL',
  dam: 'DM', dm: 'DM',
  divide: 'DV', div: 'DV', dv: 'DV', dvd: 'DV',
  drive: 'DR', dr: 'DR', driv: 'DR', drv: 'DR',
  drives: 'DRS', drs: 'DRS',
  estate: 'EST', est: 'EST',
  estates: 'ESTS', ests: 'ESTS',
  expressway: 'EXPY', exp: 'EXPY', expr: 'EXPY', express: 'EXPY', expw: 'EXPY', expy: 'EXPY',
  extension: 'EXT', ext: 'EXT', extn: 'EXT', extnsn: 'EXT',
  extensions: 'EXTS', exts: 'EXTS',
  fall: 'FALL',
  falls: 'FLS', fls: 'FLS',
  ferry: 'FRY', fry: 'FRY', frry: 'FRY',
  field: 'FLD', fld: 'FLD',
  fields: 'FLDS', flds: 'FLDS',
  flat: 'FLT', flt: 'FLT',
  flats: 'FLTS', flts: 'FLTS',
  ford: 'FRD', frd: 'FRD',
  fords: 'FRDS', frds: 'FRDS',
  forest: 'FRST', frst: 'FRST', forests: 'FRST',
  forge: 'FRG', forg: 'FRG', frg: 'FRG',
  forges: 'FRGS', frgs: 'FRGS',
  fork: 'FRK', frk: 'FRK',
  forks: 'FRKS', frks: 'FRKS',
  fort: 'FT', frt: 'FT', ft: 'FT',
  freeway: 'FWY', freewy: 'FWY', frway: 'FWY', frwy: 'FWY', fwy: 'FWY',
  garden: 'GDN', gardn: 'GDN', grden: 'GDN', grdn: 'GDN', gdn: 'GDN',
  gardens: 'GDNS', gdns: 'GDNS', grdns: 'GDNS',
  gateway: 'GTWY', gatewy: 'GTWY', gatway: 'GTWY', gtway: 'GTWY', gtwy: 'GTWY',
  glen: 'GLN', gln: 'GLN',
  glens: 'GLNS', glns: 'GLNS',
  green: 'GRN', grn: 'GRN',
  greens: 'GRNS', grns: 'GRNS',
  grove: 'GRV', grov: 'GRV', grv: 'GRV',
  groves: 'GRVS', grvs: 'GRVS',
  harbor: 'HBR', harb: 'HBR', harbr: 'HBR', hbr: 'HBR', hrbor: 'HBR',
  harbors: 'HBRS', hbrs: 'HBRS',
  haven: 'HVN', hvn: 'HVN',
  heights: 'HTS', ht: 'HTS', hts: 'HTS',
  highway: 'HWY', highwy: 'HWY', hiway: 'HWY', hiwy: 'HWY', hway: 'HWY', hwy: 'HWY',
  hill: 'HL', hl: 'HL',
  hills: 'HLS', hls: 'HLS',
  hollow: 'HOLW', hllw: 'HOLW', hollows: 'HOLW', holw: 'HOLW', holws: 'HOLW',
  inlet: 'INLT', inlt: 'INLT',
  island: 'IS', is: 'IS', islnd: 'IS',
  islands: 'ISS', iss: 'ISS', islnds: 'ISS',
  isle: 'ISLE', isles: 'ISLE',
  junction: 'JCT', jct: 'JCT', jction: 'JCT', jctn: 'JCT', junctn: 'JCT', juncton: 'JCT',
  junctions: 'JCTS', jcts: 'JCTS', jctns: 'JCTS',
  key: 'KY', ky: 'KY',
  keys: 'KYS', kys: 'KYS',
  knoll: 'KNL', knl: 'KNL', knol: 'KNL',
  knolls: 'KNLS', knls: 'KNLS',
  lake: 'LK', lk: 'LK',
  lakes: 'LKS', lks: 'LKS',
  land: 'LAND',
  landing: 'LNDG', lndg: 'LNDG', lndng: 'LNDG',
  lane: 'LN', ln: 'LN',
  light: 'LGT', lgt: 'LGT',
  lights: 'LGTS', lgts: 'LGTS',
  loaf: 'LF', lf: 'LF',
  lock: 'LCK', lck: 'LCK',
  locks: 'LCKS', lcks: 'LCKS',
  lodge: 'LDG', ldg: 'LDG', ldge: 'LDG', lodg: 'LDG',
  loop: 'LOOP', loops: 'LOOP',
  mall: 'MALL',
  manor: 'MNR', mnr: 'MNR',
  manors: 'MNRS', mnrs: 'MNRS',
  meadow: 'MDW', mdw: 'MDW',
  meadows: 'MDWS', mdws: 'MDWS', medows: 'MDWS',
  mews: 'MEWS',
  mill: 'ML', ml: 'ML',
  mills: 'MLS', mls: 'MLS',
  mission: 'MSN', missn: 'MSN', msn: 'MSN', mssn: 'MSN',
  motorway: 'MTWY', mtwy: 'MTWY',
  mount: 'MT', mnt: 'MT', mt: 'MT',
  mountain: 'MTN', mntain: 'MTN', mntn: 'MTN', mountin: 'MTN', mtin: 'MTN', mtn: 'MTN',
  mountains: 'MTNS', mntns: 'MTNS', mtns: 'MTNS',
  neck: 'NCK', nck: 'NCK',
  orchard: 'ORCH', orch: 'ORCH', orchrd: 'ORCH',
  oval: 'OVAL', ovl: 'OVAL',
  overpass: 'OPAS', opas: 'OPAS',
  park: 'PARK', prk: 'PARK',
  parks: 'PARK',
  parkway: 'PKWY', parkwy: 'PKWY', pkway: 'PKWY', pkwy: 'PKWY', pky: 'PKWY',
  parkways: 'PKWY', pkwys: 'PKWY',
  pass: 'PASS',
  passage: 'PSGE', psge: 'PSGE',
  path: 'PATH', paths: 'PATH',
  pike: 'PIKE', pikes: 'PIKE',
  pine: 'PNE', pne: 'PNE',
  pines: 'PNES', pnes: 'PNES',
  place: 'PL', pl: 'PL',
  plain: 'PLN', pln: 'PLN',
  plains: 'PLNS', plns: 'PLNS',
  plaza: 'PLZ', plz: 'PLZ', plza: 'PLZ',
  point: 'PT', pt: 'PT',
  points: 'PTS', pts: 'PTS',
  port: 'PRT', prt: 'PRT',
  ports: 'PRTS', prts: 'PRTS',
  prairie: 'PR', pr: 'PR', prr: 'PR',
  radial: 'RADL', rad: 'RADL', radiel: 'RADL', radl: 'RADL',
  ramp: 'RAMP',
  ranch: 'RNCH', ranches: 'RNCH', rnch: 'RNCH', rnchs: 'RNCH',
  rapid: 'RPD', rpd: 'RPD',
  rapids: 'RPDS', rpds: 'RPDS',
  rest: 'RST', rst: 'RST',
  ridge: 'RDG', rdg: 'RDG', rdge: 'RDG',
  ridges: 'RDGS', rdgs: 'RDGS',
  river: 'RIV', riv: 'RIV', rvr: 'RIV', rivr: 'RIV',
  road: 'RD', rd: 'RD',
  roads: 'RDS', rds: 'RDS',
  route: 'RTE', rte: 'RTE',
  row: 'ROW',
  rue: 'RUE',
  run: 'RUN',
  shoal: 'SHL', shl: 'SHL',
  shoals: 'SHLS', shls: 'SHLS',
  shore: 'SHR', shoar: 'SHR', shr: 'SHR',
  shores: 'SHRS', shoars: 'SHRS', shrs: 'SHRS',
  skyway: 'SKWY', skwy: 'SKWY',
  spring: 'SPG', spg: 'SPG', spng: 'SPG', sprng: 'SPG',
  springs: 'SPGS', spgs: 'SPGS', spngs: 'SPGS', sprngs: 'SPGS',
  spur: 'SPUR', spurs: 'SPUR',
  square: 'SQ', sq: 'SQ', sqr: 'SQ', sqre: 'SQ', squ: 'SQ',
  squares: 'SQS', sqs: 'SQS', sqrs: 'SQS',
  station: 'STA', sta: 'STA', statn: 'STA', stn: 'STA',
  stravenue: 'STRA', stra: 'STRA', strav: 'STRA', straven: 'STRA', stravn: 'STRA', strvn: 'STRA', strvnue: 'STRA',
  stream: 'STRM', streme: 'STRM', strm: 'STRM',
  street: 'ST', st: 'ST', str: 'ST', strt: 'ST',
  streets: 'STS', sts: 'STS',
  summit: 'SMT', smt: 'SMT', sumit: 'SMT', sumitt: 'SMT',
  terrace: 'TER', ter: 'TER', terr: 'TER',
  throughway: 'TRWY', trwy: 'TRWY',
  trace: 'TRCE', trce: 'TRCE', traces: 'TRCE',
  track: 'TRAK', trak: 'TRAK', tracks: 'TRAK', trk: 'TRAK', trks: 'TRAK',
  trafficway: 'TRFY', trfy: 'TRFY',
  trail: 'TRL', trl: 'TRL', trails: 'TRL', trls: 'TRL',
  trailer: 'TRLR', trlr: 'TRLR', trlrs: 'TRLR',
  tunnel: 'TUNL', tunel: 'TUNL', tunl: 'TUNL', tunls: 'TUNL', tunnl: 'TUNL', tunnels: 'TUNL',
  turnpike: 'TPKE', tpke: 'TPKE', trnpk: 'TPKE', turnpk: 'TPKE',
  underpass: 'UPAS', upas: 'UPAS',
  union: 'UN', un: 'UN',
  unions: 'UNS', uns: 'UNS',
  valley: 'VLY', vally: 'VLY', vlly: 'VLY', vly: 'VLY',
  valleys: 'VLYS', vlys: 'VLYS',
  viaduct: 'VIA', vdct: 'VIA', via: 'VIA', viadct: 'VIA',
  view: 'VW', vw: 'VW',
  views: 'VWS', vws: 'VWS',
  village: 'VLG', vill: 'VLG', villag: 'VLG', villg: 'VLG', villiage: 'VLG', vlg: 'VLG',
  villages: 'VLGS', vlgs: 'VLGS',
  ville: 'VL', vl: 'VL',
  vista: 'VIS', vis: 'VIS', vist: 'VIS', vst: 'VIS', vsta: 'VIS',
  walk: 'WALK', walks: 'WALK',
  wall: 'WALL',
  way: 'WAY',
  ways: 'WAYS',
  well: 'WL', wl: 'WL',
  wells: 'WLS', wls: 'WLS'
};

const DIRECTIONALS = {
  north: 'N', n: 'N',
  south: 'S', s: 'S',
  east: 'E', e: 'E',
  west: 'W', w: 'W',
  northeast: 'NE', ne: 'NE',
  northwest: 'NW', nw: 'NW',
  southeast: 'SE', se: 'SE',
  southwest: 'SW', sw: 'SW'
};

const SECONDARY_UNITS = {
  apartment: 'APT', apt: 'APT',
  basement: 'BSMT', bsmt: 'BSMT',
  building: 'BLDG', bldg: 'BLDG',
  department: 'DEPT', dept: 'DEPT',
  floor: 'FL', fl: 'FL',
  front: 'FRNT', frnt: 'FRNT',
  hangar: 'HNGR', hngr: 'HNGR',
  lobby: 'LBBY', lbby: 'LBBY',
  lot: 'LOT',
  lower: 'LOWR', lowr: 'LOWR',
  office: 'OFC', ofc: 'OFC',
  penthouse: 'PH', ph: 'PH',
  pier: 'PIER',
  rear: 'REAR',
  room: 'RM', rm: 'RM',
  side: 'SIDE',
  slip: 'SLIP',
  space: 'SPC', spc: 'SPC',
  stop: 'STOP',
  suite: 'STE', ste: 'STE',
  trailer: 'TRLR', trlr: 'TRLR',
  unit: 'UNIT',
  upper: 'UPPR', uppr: 'UPPR'
};

function standardizeStreet(street) {
  if (!street) return '';

  // Normalize multiple spaces and trim
  let normalized = street.replace(/\s+/g, ' ').trim();

  // Remove trailing periods (e.g. "St." → "St")
  normalized = normalized.replace(/\.(\s|$)/g, '$1').trim();

  const words = normalized.split(' ');
  const result = [];

  for (let i = 0; i < words.length; i++) {
    const lower = words[i].toLowerCase();

    // Check directionals (first or last word)
    if (i === 0 || i === words.length - 1) {
      if (DIRECTIONALS[lower]) {
        result.push(DIRECTIONALS[lower]);
        continue;
      }
    }

    // Check secondary unit designators
    if (SECONDARY_UNITS[lower]) {
      result.push(SECONDARY_UNITS[lower]);
      continue;
    }

    // Check street suffixes (typically not the first word)
    if (i > 0 && STREET_SUFFIXES[lower]) {
      result.push(STREET_SUFFIXES[lower]);
      continue;
    }

    // Keep as-is (preserve original casing for names/numbers)
    result.push(words[i]);
  }

  return result.join(' ');
}

function standardizeCity(city) {
  if (!city) return '';
  return city.replace(/\s+/g, ' ').trim();
}

function standardizeState(state) {
  if (!state) return '';
  return state.replace(/\s+/g, ' ').trim().toUpperCase();
}

function standardizeZip(zip) {
  if (!zip) return '';
  const cleaned = zip.replace(/\s+/g, '').trim();

  // 5-digit ZIP
  if (/^\d{5}$/.test(cleaned)) return cleaned;

  // ZIP+4 with or without dash
  const plus4 = cleaned.match(/^(\d{5})-?(\d{4})$/);
  if (plus4) return `${plus4[1]}-${plus4[2]}`;

  // Return cleaned as-is if it doesn't match known formats
  return cleaned;
}

function standardizeAddress(address) {
  if (!address || typeof address !== 'object') return {};

  const result = {};
  if (address.street !== undefined) result.street = standardizeStreet(String(address.street));
  if (address.city !== undefined) result.city = standardizeCity(String(address.city));
  if (address.state !== undefined) result.state = standardizeState(String(address.state));
  if (address.zip !== undefined) result.zip = standardizeZip(String(address.zip));
  return result;
}

module.exports = {
  standardizeStreet,
  standardizeCity,
  standardizeState,
  standardizeZip,
  standardizeAddress,
  STREET_SUFFIXES,
  DIRECTIONALS,
  SECONDARY_UNITS
};
