/**
 * MAC Address OUI to Manufacturer / Vendor mapping table
 * and intelligent brand / vendor resolver.
 */

// Common IEEE OUI prefixes (normalized uppercase without colons, 6 chars)
const OUI_DATABASE: Record<string, string> = {
  // Hisense Visual Technology & Displays
  '903C1D': 'Hisense',
  '001556': 'Hisense',
  '78A351': 'Hisense',
  '64D4BD': 'Hisense',
  '302303': 'Hisense',
  'A02BB8': 'Hisense',
  '20F41B': 'Hisense',
  '702E22': 'Hisense',
  'C83D97': 'Hisense',
  'E06417': 'Hisense',

  // Samsung & Smart Displays / E-Board
  'E8FCAF': 'Samsung Electronics',
  '0007AB': 'Samsung',
  '001247': 'Samsung',
  '001599': 'Samsung',
  '001D25': 'Samsung',
  '002119': 'Samsung',
  '0023D7': 'Samsung',
  '002454': 'Samsung',
  '00265D': 'Samsung',
  '0808C2': 'Samsung',
  '0C1420': 'Samsung',
  '1449E0': 'Samsung',
  '1489FD': 'Samsung',
  '18227E': 'Samsung',
  '1C5A3E': 'Samsung',
  '244B03': 'Samsung',
  '28CC01': 'Samsung',
  '30CDA7': 'Samsung',
  '34BE00': 'Samsung',
  '380A94': 'Samsung',
  '400E85': 'Samsung',
  '444E1A': 'Samsung',
  '4CBC42': 'Samsung',
  '5056BF': 'Samsung',
  '5492BE': 'Samsung',
  '5C2E59': 'Samsung',
  '606BBD': 'Samsung',
  '647791': 'Samsung',
  '6C8336': 'Samsung',
  '702C1F': 'Samsung',
  '78471D': 'Samsung',
  '78ABBB': 'Samsung',
  '805719': 'Samsung',
  '8425DB': 'Samsung',
  '88329B': 'Samsung',
  '8C71F8': 'Samsung',
  '90187C': 'Samsung',
  '946372': 'Samsung',
  '980D2E': 'Samsung',
  'A00798': 'Samsung',
  'A4EBD3': 'Samsung',
  'A87C01': 'Samsung',
  'AC5F3E': 'Samsung',
  'B0EC71': 'Samsung',
  'B407F9': 'Samsung',
  'BC4486': 'Samsung',
  'C09727': 'Samsung',
  'C44202': 'Samsung',
  'C819F7': 'Samsung',
  'CC07AB': 'Samsung',
  'D059E4': 'Samsung',
  'D487D8': 'Samsung',
  'DC7144': 'Samsung',
  'E458B8': 'Samsung',
  'E8508B': 'Samsung',
  'EC107B': 'Samsung',
  'F025B7': 'Samsung',
  'F47B5E': 'Samsung',
  'F8042E': 'Samsung',
  'FCA13E': 'Samsung',

  // Cisco & Meraki
  '000142': 'Cisco',
  '000143': 'Cisco',
  '000196': 'Cisco',
  '000197': 'Cisco',
  '000216': 'Cisco',
  '000217': 'Cisco',
  '00024A': 'Cisco',
  '00024B': 'Cisco',
  '00027D': 'Cisco',
  '00027E': 'Cisco',
  '0002BA': 'Cisco',
  '0002BB': 'Cisco',
  '0002FC': 'Cisco',
  '0002FD': 'Cisco',
  '000331': 'Cisco',
  '000332': 'Cisco',
  '00036B': 'Cisco',
  '00036C': 'Cisco',
  '00039F': 'Cisco',
  '0003A0': 'Cisco',
  '0003E3': 'Cisco',
  '0003E4': 'Cisco',
  '001A2B': 'Cisco',
  '002255': 'Cisco',
  '002414': 'Cisco',
  '002698': 'Cisco',
  '10F311': 'Cisco',
  '188090': 'Cisco',
  '285261': 'Cisco',
  '382056': 'Cisco',
  '4403A7': 'Cisco',
  '503DE5': 'Cisco',
  '5475D0': 'Cisco',
  '58F39C': 'Cisco',
  '649EF3': 'Cisco',
  '6C9CED': 'Cisco',
  '70EA1A': 'Cisco',
  '78BAF9': 'Cisco',
  '885A92': 'Cisco',
  '94F665': 'Cisco',
  'A0E0AF': 'Cisco',
  'ACA016': 'Cisco',
  'B0AA77': 'Cisco',
  'C47295': 'Cisco',
  'D46D50': 'Cisco',
  'DCEB94': 'Cisco',
  'E4AA5D': 'Cisco',
  'F44E05': 'Cisco',
  'F8C001': 'Cisco',
  '00180A': 'Cisco Meraki',
  '003A9A': 'Cisco Meraki',
  'AC17C8': 'Cisco Meraki',
  'E0553D': 'Cisco Meraki',

  // Ubiquiti Networks (UniFi)
  '00156D': 'Ubiquiti (UniFi)',
  '002722': 'Ubiquiti (UniFi)',
  '24A43C': 'Ubiquiti (UniFi)',
  '44D9E7': 'Ubiquiti (UniFi)',
  '68D79A': 'Ubiquiti (UniFi)',
  '7483C2': 'Ubiquiti (UniFi)',
  '788A20': 'Ubiquiti (UniFi)',
  '802AA8': 'Ubiquiti (UniFi)',
  'B4FBE4': 'Ubiquiti (UniFi)',
  'DC9FDB': 'Ubiquiti (UniFi)',
  'F09FC2': 'Ubiquiti (UniFi)',

  // MikroTik
  '000C42': 'MikroTik',
  '488F5A': 'MikroTik',
  '64D154': 'MikroTik',
  '6C3B6B': 'MikroTik',
  '744D28': 'MikroTik',
  '789A18': 'MikroTik',
  'B869F4': 'MikroTik',
  'C4AD34': 'MikroTik',
  'D401C3': 'MikroTik',
  'D4CA6D': 'MikroTik',
  'E48D8C': 'MikroTik',

  // TP-Link
  '0019E0': 'TP-Link',
  '002719': 'TP-Link',
  '1027F5': 'TP-Link',
  '147590': 'TP-Link',
  '14CC20': 'TP-Link',
  '18D6C7': 'TP-Link',
  '30B5C2': 'TP-Link',
  '503AA0': 'TP-Link',
  '50C7BF': 'TP-Link',
  '6032B1': 'TP-Link',
  '74DA88': 'TP-Link',
  '90F652': 'TP-Link',
  '98DAC4': 'TP-Link',
  'A0F3C1': 'TP-Link',
  'B0BE76': 'TP-Link',
  'C025E9': 'TP-Link',
  'C46E1F': 'TP-Link',
  'D46E0E': 'TP-Link',
  'D86CE9': 'TP-Link',
  'E848B8': 'TP-Link',
  'EC086B': 'TP-Link',
  'F4F26D': 'TP-Link',
  'F81A67': 'TP-Link',

  // Huawei
  '001E10': 'Huawei',
  '00259E': 'Huawei',
  '104780': 'Huawei',
  '200BC7': 'Huawei',
  '286ED4': 'Huawei',
  '346BD3': 'Huawei',
  '404D8E': 'Huawei',
  '4846FB': 'Huawei',
  '707BE8': 'Huawei',
  '80B686': 'Huawei',
  'A4999B': 'Huawei',
  'B43052': 'Huawei',
  'C8D15E': 'Huawei',
  'DCD2FC': 'Huawei',
  'E0247F': 'Huawei',
  'F4DCF9': 'Huawei',

  // Apple
  '000393': 'Apple',
  '000502': 'Apple',
  '000A27': 'Apple',
  '000A95': 'Apple',
  '000D93': 'Apple',
  '0010FA': 'Apple',
  '001124': 'Apple',
  '001451': 'Apple',
  '0016CB': 'Apple',
  '0017F2': 'Apple',
  '0019E3': 'Apple',
  '001B63': 'Apple',
  '001C60': 'Apple',
  '001C70': 'Apple',
  '001C79': 'Apple',
  '001D4F': 'Apple',
  '001E52': 'Apple',
  '001E8B': 'Apple',
  '001F5B': 'Apple',
  '001F6E': 'Apple',
  '0021E9': 'Apple',
  '002241': 'Apple',
  '002312': 'Apple',
  '002332': 'Apple',
  '00236C': 'Apple',
  '002436': 'Apple',
  '002500': 'Apple',
  '00254B': 'Apple',
  '002608': 'Apple',
  '00264A': 'Apple',
  '0026B0': 'Apple',
  '0026BB': 'Apple',
  '008865': 'Apple',
  '040CCE': 'Apple',
  '045453': 'Apple',
  '0C771A': 'Apple',
  '109ADD': 'Apple',
  '14109F': 'Apple',
  '18AF61': 'Apple',
  '18EE69': 'Apple',
  '207D74': 'Apple',
  '24AB81': 'Apple',
  '286B35': 'Apple',
  '28CFE9': 'Apple',
  '34159E': 'Apple',
  '38CA84': 'Apple',
  '3C0754': 'Apple',
  '406C8F': 'Apple',
  '40B076': 'Apple',
  '442A60': 'Apple',
  '48437C': 'Apple',
  '48D705': 'Apple',
  '4CB199': 'Apple',
  '50BC96': 'Apple',
  '544E90': 'Apple',
  '5855CA': 'Apple',
  '5C879C': 'Apple',
  '5C95AE': 'Apple',
  '600308': 'Apple',
  '60C547': 'Apple',
  '64200C': 'Apple',
  '685B35': 'Apple',
  '6C4008': 'Apple',
  '701124': 'Apple',
  '705681': 'Apple',
  '74E1B6': 'Apple',
  '784F43': 'Apple',
  '787B8A': 'Apple',
  '7C0191': 'Apple',
  '7C6D62': 'Apple',
  '80E650': 'Apple',
  '843835': 'Apple',
  '8866A5': 'Apple',
  '8C8590': 'Apple',
  '907240': 'Apple',
  '94103E': 'Apple',
  '9801A7': 'Apple',
  '9C04EB': 'Apple',
  'A0999B': 'Apple',
  'A483E7': 'Apple',
  'A4C361': 'Apple',
  'A8667F': 'Apple',
  'AC87A3': 'Apple',
  'ACBC32': 'Apple',
  'B065BD': 'Apple',
  'B418D1': 'Apple',
  'B8782E': 'Apple',
  'BC52B7': 'Apple',
  'BCD177': 'Apple',
  'C0847A': 'Apple',
  'C42C03': 'Apple',
  'C81EE7': 'Apple',
  'CC29F5': 'Apple',
  'D023DB': 'Apple',
  'D4DCCD': 'Apple',
  'D89695': 'Apple',
  'D8BB2C': 'Apple',
  'DC3716': 'Apple',
  'E0C767': 'Apple',
  'E4CE8F': 'Apple',
  'E8040B': 'Apple',
  'E8802E': 'Apple',
  'EC3586': 'Apple',
  'F01898': 'Apple',
  'F0DBF8': 'Apple',
  'F40F24': 'Apple',
  'F81EDF': 'Apple',
  'FC183C': 'Apple',
  'FCE998': 'Apple',

  // Dell
  '001422': 'Dell',
  '00188B': 'Dell',
  '002170': 'Dell',
  '0024E8': 'Dell',
  '14FEB5': 'Dell',
  '1866DA': 'Dell',
  '24B6FD': 'Dell',
  '3417EB': 'Dell',
  '5CF9DD': 'Dell',
  '74867A': 'Dell',
  '847BEB': 'Dell',
  '90B11C': 'Dell',
  'A4BADB': 'Dell',
  'B82A72': 'Dell',
  'BC305B': 'Dell',
  'C81F66': 'Dell',
  'D4BED9': 'Dell',
  'ECF4BB': 'Dell',
  'F8DB88': 'Dell',

  // HP / Hewlett Packard
  '001A4B': 'HP',
  '001E0B': 'HP',
  '00215A': 'HP',
  '00237D': 'HP',
  '0025B3': 'HP',
  '10604B': 'HP',
  '18A905': 'HP',
  '28924A': 'HP',
  '3CD92B': 'HP',
  '5065F3': 'HP',
  '645106': 'HP',
  '705A0F': 'HP',
  '9CB654': 'HP',
  'A0D3C1': 'HP',
  'B499BA': 'HP',
  'C8CBB8': 'HP',
  'D89D67': 'HP',
  'EC8EB5': 'HP',

  // Intel
  '000423': 'Intel',
  '001302': 'Intel',
  '001500': 'Intel',
  '001676': 'Intel',
  '0019D1': 'Intel',
  '001B77': 'Intel',
  '001CC0': 'Intel',
  '001DE0': 'Intel',
  '001E67': 'Intel',
  '001F3B': 'Intel',
  '00216A': 'Intel',
  '0022FB': 'Intel',
  '002314': 'Intel',
  '0024D6': 'Intel',
  '0024D7': 'Intel',
  '0026C7': 'Intel',
  '002710': 'Intel',
  '6805CA': 'Intel',
  '7C5CF8': 'Intel',
  '84A6C8': 'Intel',
  'A0369F': 'Intel',
  'A44E31': 'Intel',
  'C85B76': 'Intel',
  'E82AEA': 'Intel',
  'F8633F': 'Intel',

  // Raspberry Pi
  'B827EB': 'Raspberry Pi',
  'DCA632': 'Raspberry Pi',
  'E45F01': 'Raspberry Pi',
  '28CDC1': 'Raspberry Pi',
  'D83ADD': 'Raspberry Pi',
  '2CCF67': 'Raspberry Pi',

  // Espressif (ESP32/ESP8266 IoT)
  '240AC4': 'Espressif (ESP32/IoT)',
  '30AEA4': 'Espressif (ESP32/IoT)',
  '246F28': 'Espressif (ESP32/IoT)',
  '3C71BF': 'Espressif (ESP32/IoT)',
  '840D8E': 'Espressif (ESP32/IoT)',
  '84F3EB': 'Espressif (ESP32/IoT)',
  'A4CF12': 'Espressif (ESP32/IoT)',
  'A4E57C': 'Espressif (ESP32/IoT)',
  'AC67B2': 'Espressif (ESP32/IoT)',
  'B4E62D': 'Espressif (ESP32/IoT)',
  'C44F33': 'Espressif (ESP32/IoT)',
  'CC50E3': 'Espressif (ESP32/IoT)',
  'DC4F22': 'Espressif (ESP32/IoT)',
  'ECFABC': 'Espressif (ESP32/IoT)',

  // Surveillance / IP Cameras (Hikvision, Dahua, Axis)
  '000CE5': 'Hikvision (IP Camera)',
  '001212': 'Hikvision (IP Camera)',
  '1012FB': 'Hikvision (IP Camera)',
  '1402EC': 'Hikvision (IP Camera)',
  '1868CB': 'Hikvision (IP Camera)',
  '241478': 'Hikvision (IP Camera)',
  '2857BE': 'Hikvision (IP Camera)',
  '3C1BF8': 'Hikvision (IP Camera)',
  '4419B6': 'Hikvision (IP Camera)',
  '5803FB': 'Hikvision (IP Camera)',
  '64DB8B': 'Hikvision (IP Camera)',
  '74A78E': 'Hikvision (IP Camera)',
  '807871': 'Hikvision (IP Camera)',
  '9C1463': 'Hikvision (IP Camera)',
  'BC5451': 'Hikvision (IP Camera)',
  'C056E3': 'Hikvision (IP Camera)',
  'D81265': 'Hikvision (IP Camera)',
  'E0508B': 'Hikvision (IP Camera)',
  'F4B429': 'Hikvision (IP Camera)',
  '001A92': 'Dahua Technology',
  '38AF29': 'Dahua Technology',
  '402C76': 'Dahua Technology',
  '4C11BF': 'Dahua Technology',
  '5870C6': 'Dahua Technology',
  '74A857': 'Dahua Technology',
  '9002A9': 'Dahua Technology',
  'A0BD1D': 'Dahua Technology',
  'BC325F': 'Dahua Technology',
  'F45EAB': 'Dahua Technology',
  '00408C': 'Axis Communications',
  'ACCC8E': 'Axis Communications',

  // LG Electronics & Displays
  '001C62': 'LG Electronics',
  '047D7B': 'LG Electronics',
  '10683F': 'LG Electronics',
  '18421D': 'LG Electronics',
  '203D66': 'LG Electronics',
  '34FCEF': 'LG Electronics',
  '4437E6': 'LG Electronics',
  '58A2B5': 'LG Electronics',
  '6CD68A': 'LG Electronics',
  '785DC8': 'LG Electronics',
  '88366C': 'LG Electronics',
  '9893CC': 'LG Electronics',
  'A823FE': 'LG Electronics',
  'B4E1EB': 'LG Electronics',
  'C4366C': 'LG Electronics',
  'CC2D8C': 'LG Electronics',
  'D013FD': 'LG Electronics',
  'E85B5B': 'LG Electronics',
  'F80CF3': 'LG Electronics',

  // Sony
  '00014A': 'Sony',
  '00041F': 'Sony',
  '001315': 'Sony',
  '0019C5': 'Sony',
  '001DBA': 'Sony',
  '0024BE': 'Sony',
  '04766E': 'Sony',
  '280DFC': 'Sony',
  '30074D': 'Sony',
  '544249': 'Sony',
  '709E29': 'Sony',
  '880355': 'Sony',
  'AC9B0A': 'Sony',
  'D8D43C': 'Sony',
  'FCF136': 'Sony',

  // Virtualization / Hypervisors
  '000569': 'VMware',
  '000C29': 'VMware',
  '005056': 'VMware',
  '00163E': 'Xen / Hypervisor',
  '525400': 'QEMU / KVM',
  '080027': 'Oracle VirtualBox',
  '00155D': 'Microsoft Hyper-V',

  // Printers (Canon, Epson, Brother, HP, Ricoh)
  '000085': 'Canon',
  '001E8F': 'Canon',
  '180CAC': 'Canon',
  '70B950': 'Canon',
  '000048': 'Epson',
  '0026AB': 'Epson',
  'AC1826': 'Epson',
  '001BA9': 'Brother',
  '008077': 'Brother',
  '30055C': 'Brother',
  '000074': 'Ricoh',
  '002673': 'Ricoh'
};

/**
 * Normalizes a MAC address string to standard format: XX:XX:XX:XX:XX:XX
 */
export function normalizeMacAddress(mac?: string): string {
  if (!mac) return '';
  const clean = mac.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (clean.length === 12) {
    return clean.match(/.{1,2}/g)?.join(':') || clean;
  }
  return mac.trim();
}

/**
 * Extracts 6-character OUI hex from a MAC address string
 */
export function extractOui(mac?: string): string {
  if (!mac) return '';
  const clean = mac.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  return clean.substring(0, 6);
}

/**
 * Finds vendor name from MAC address
 */
export function getVendorFromMac(mac?: string): string | null {
  if (!mac) return null;
  const oui = extractOui(mac);
  if (oui && OUI_DATABASE[oui]) {
    return OUI_DATABASE[oui];
  }
  return null;
}

/**
 * Brand heuristic matching based on model or device name keywords
 */
const BRAND_KEYWORDS: Array<{ patterns: RegExp[]; vendor: string }> = [
  { patterns: [/hisense/i, /hisense visual/i, /hisense visual technology/i], vendor: 'Hisense' },
  { patterns: [/samsung/i, /flip\s*\d+/i, /wac\b/i, /qm\d+/i, /lh\d+/i], vendor: 'Samsung' },
  { patterns: [/maxhub/i, /cvte/i], vendor: 'Maxhub' },
  { patterns: [/viewsonic/i, /myviewboard/i], vendor: 'ViewSonic' },
  { patterns: [/promethean/i, /activpanel/i], vendor: 'Promethean' },
  { patterns: [/benq/i, /edupack/i], vendor: 'BenQ' },
  { patterns: [/cisco/i, /catalyst/i, /meraki/i, /nexus/i, /aironet/i], vendor: 'Cisco' },
  { patterns: [/unifi/i, /ubiquiti/i, /u6/i, /uap/i, /usw/i, /udm/i], vendor: 'Ubiquiti' },
  { patterns: [/mikrotik/i, /routerboard/i, /hap/i, /hex/i, /cloud\s*router/i], vendor: 'MikroTik' },
  { patterns: [/tp-link/i, /tplink/i, /archer/i, /omada/i, /deco/i, /tl-sg/i], vendor: 'TP-Link' },
  { patterns: [/huawei/i, /ar\d+/i, /s5700/i, /cloudengine/i], vendor: 'Huawei' },
  { patterns: [/apple/i, /macbook/i, /imac/i, /mac\s*mini/i, /ipad/i, /iphone/i, /apple\s*tv/i], vendor: 'Apple' },
  { patterns: [/dell/i, /poweredge/i, /optiplex/i, /latitude/i, /inspiron/i], vendor: 'Dell' },
  { patterns: [/hp\b/i, /hewlett/i, /proliant/i, /laserjet/i, /deskjet/i, /pagewide/i, /aruba/i], vendor: 'HP' },
  { patterns: [/hikvision/i, /ds-2cd/i, /colorvu/i, /acusense/i], vendor: 'Hikvision' },
  { patterns: [/dahua/i, /ipc-hdw/i, /wizsense/i], vendor: 'Dahua' },
  { patterns: [/lg\b/i, /ultrafine/i, /webos/i, /gram/i], vendor: 'LG' },
  { patterns: [/sony/i, /bravia/i, /playstation/i], vendor: 'Sony' },
  { patterns: [/epson/i, /workforce/i, /ecotank/i], vendor: 'Epson' },
  { patterns: [/canon/i, /imageclass/i, /pixma/i], vendor: 'Canon' },
  { patterns: [/brother/i, /mfc-/i, /hl-/i], vendor: 'Brother' },
  { patterns: [/raspberry/i, /rpi\b/i, /raspbian/i], vendor: 'Raspberry Pi' },
  { patterns: [/espressif/i, /esp32/i, /esp8266/i, /nodemcu/i], vendor: 'Espressif' },
  { patterns: [/vmware/i, /esxi/i, /vcenter/i], vendor: 'VMware' },
  { patterns: [/d-link/i, /dlink/i, /des-/i, /dgs-/i], vendor: 'D-Link' },
  { patterns: [/asus/i, /rog\b/i, /rt-ax/i], vendor: 'ASUS' },
  { patterns: [/synology/i, /diskstation/i], vendor: 'Synology' },
  { patterns: [/qnap/i, /ts-\d+/i], vendor: 'QNAP' }
];

/**
 * Intelligent vendor resolver combining MAC OUI and device metadata
 */
export function resolveDeviceVendor(device: {
  macAddress?: string;
  model?: string;
  name?: string;
  type?: string;
}): {
  vendor: string;
  model: string;
  mac: string;
  source: 'mac' | 'model' | 'name' | 'type' | 'unknown';
} {
  const normMac = normalizeMacAddress(device.macAddress);

  // 1. Try MAC OUI lookup first (highest hardware precision)
  if (normMac) {
    const macVendor = getVendorFromMac(normMac);
    if (macVendor) {
      return {
        vendor: macVendor,
        model: (device.model || '').trim(),
        mac: normMac,
        source: 'mac'
      };
    }
  }

  // 2. Try heuristic keyword matching from Model string
  const modelStr = (device.model || '').trim();
  if (modelStr) {
    for (const item of BRAND_KEYWORDS) {
      if (item.patterns.some(p => p.test(modelStr))) {
        return {
          vendor: item.vendor,
          model: modelStr,
          mac: normMac,
          source: 'model'
        };
      }
    }
    // Clean up generic legal entity suffixes if model string was stored as company name
    const cleanedVendor = modelStr
      .replace(/(?:visual\s+technology|electronics|technology|corporation|corp\.?|co\.,?\s*ltd\.?|inc\.?|ltd\.?)/gi, '')
      .trim();
    if (cleanedVendor && cleanedVendor.length > 2) {
      return {
        vendor: cleanedVendor,
        model: modelStr,
        mac: normMac,
        source: 'model'
      };
    }
  }

  // 3. Try heuristic keyword matching from Device Name
  const nameStr = (device.name || '').trim();
  if (nameStr) {
    for (const item of BRAND_KEYWORDS) {
      if (item.patterns.some(p => p.test(nameStr))) {
        return {
          vendor: item.vendor,
          model: modelStr,
          mac: normMac,
          source: 'name'
        };
      }
    }
  }

  // 4. Fallback if model/vendor is still empty
  if (modelStr) {
    return {
      vendor: modelStr,
      model: modelStr,
      mac: normMac,
      source: 'model'
    };
  }

  return {
    vendor: device.type === 'E-Board' ? 'Smart Board' : 'Generic',
    model: '',
    mac: normMac,
    source: 'unknown'
  };
}
