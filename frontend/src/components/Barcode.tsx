import React from 'react';

interface BarcodeProps {
  value: string;
  type: 'Code128' | 'EAN13' | 'QRCode';
  width?: number; // scale width
  height?: number; // scale height
}

// Compact Code128 B pattern representation (width of alternate bars & spaces)
export const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", // 0-9
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", // 10-19
  "221231", "213212", "223112", "312131", "311222", "311123", "311321", "321122", "321221", "312212", // 20-29
  "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", // 30-39
  "132311", "211313", "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", // 40-49
  "313121", "211331", "231131", "213113", "213311", "213131", "311132", "311312", "112214", "112412", // 50-59
  "142212", "114212", "124112", "124211", "411212", "421112", "421211", "212141", "214121", "242111", // 60-69
  "212114", "212411", "251111", "211142", "211412", "221113", "221311", "221113", "234111", "111242", // 70-79
  "111421", "121142", "121421", "141122", "141221", "112213", "121113", "121311", "302011", "301120", // 80-89
  "301210", "312010", "311200", "321100", "312200", "322100", "212021", "212120", "212210", "211022", // 90-99
  "220012", "200212", "200221", // 100-102
  "211412", "211214", "211232", "2331112" // 103 (Start A), 104 (Start B), 105 (Start C), 106 (Stop)
];

function encodeCode128B(text: string): string {
  let sum = 104; // Start B
  const chars: number[] = [104];
  
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const value = code - 32;
    if (value < 0 || value > 95) continue;
    sum += value * (i + 1);
    chars.push(value);
  }
  
  const checksum = sum % 103;
  chars.push(checksum);
  chars.push(106); // Stop
  
  return chars.map(c => CODE128_PATTERNS[c]).join('');
}

export default function Barcode({ value, type, width = 2, height = 70 }: BarcodeProps) {
  if (!value) return null;

  if (type === 'QRCode') {
    const size = Math.max(50, height * 1.5);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${Math.round(size)}x${Math.round(size)}&data=${encodeURIComponent(value)}`;
    return (
      <img 
        src={qrUrl} 
        alt={`QR Code: ${value}`} 
        style={{ width: size, height: size, objectFit: 'contain' }}
        crossOrigin="anonymous"
      />
    );
  }

  if (type === 'EAN13') {
    // Fallback EAN13 helper using free bwip-js API, or render code128 if invalid digits
    const cleanValue = value.replace(/\D/g, '');
    if (cleanValue.length === 13) {
      const eanUrl = `https://bwipjs-api.metafloor.com/?bcid=ean13&text=${cleanValue}&scale=2&height=${height}&includetext`;
      return (
        <img 
          src={eanUrl} 
          alt={`EAN13: ${cleanValue}`} 
          style={{ height: height + 25, objectFit: 'contain' }}
          crossOrigin="anonymous"
        />
      );
    }
    // If text is not EAN13 format, fallback to rendering Code128 natively
  }

  // Native SVG Code128 B Generator
  try {
    const widthString = encodeCode128B(value);
    let currentX = 0;
    const rects: React.ReactNode[] = [];
    
    for (let i = 0; i < widthString.length; i++) {
      const w = parseInt(widthString[i], 10);
      if (i % 2 === 0) {
        // Odd index = Bar (drawn as black rectangle)
        rects.push(
          <rect 
            key={i} 
            x={currentX * width} 
            y={0} 
            width={w * width} 
            height={height} 
            fill="#000" 
          />
        );
      }
      currentX += w;
    }

    const totalWidth = currentX * width;

    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
        <svg 
          width={totalWidth} 
          height={height} 
          viewBox={`0 0 ${totalWidth} ${height}`}
        >
          {rects}
        </svg>
        <span style={{ fontSize: '10px', marginTop: '4px', letterSpacing: '1px', fontFamily: 'monospace' }}>
          {value}
        </span>
      </div>
    );
  } catch (err) {
    console.error('Failed to generate Code128 barcode', err);
    return <span>{value}</span>;
  }
}
