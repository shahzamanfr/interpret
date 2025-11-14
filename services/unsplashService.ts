// Unsplash API service for domain-specific images
const UNSPLASH_ACCESS_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY || '';

export interface UnsplashImage {
  id: string;
  urls: {
    regular: string;
    small: string;
    thumb: string;
  };
  alt_description: string;
  description: string;
}

export interface UnsplashSearchResponse {
  results: UnsplashImage[];
  total: number;
  total_pages: number;
}

// Domain-specific search queries
const DOMAIN_QUERIES = {
  'professional-scenes': 'business office meeting corporate workplace presentation team boardroom conference handshake collaboration executive professional work',
  'emotions-expression': 'portrait emotion expression face human feeling reaction mood smile laugh serious contemplative person people',
  'nature-environment': 'nature landscape forest mountain ocean wildlife outdoor environment sunset sunrise trees water natural scenic',
  'technology-innovation': 'technology innovation tech digital computer robot ai future lab data cyber modern science engineering',
  'places-architecture': 'architecture building city landmark place urban design structure bridge tower monument construction architectural',
  'art-creativity': 'art creative artist studio painting design craft imagination sculpture gallery workshop artistic',
  'human-stories': 'family people relationship community life story human connection friends children elderly social personal',
  'dream-fantasy': 'fantasy dream surreal magical neon aurora mystical ethereal cosmic space universe abstract artistic'
};

export async function fetchDomainImages(domainSlug: string, count: number = 25): Promise<UnsplashImage[]> {
  const query = DOMAIN_QUERIES[domainSlug as keyof typeof DOMAIN_QUERIES] || 'abstract';
  
  try {
    // For now, return a fallback solution using a reliable image service
    return generateFallbackImages(domainSlug, count);
  } catch (error) {
    console.error('Error fetching images:', error);
    return generateFallbackImages(domainSlug, count);
  }
}

// Fallback solution using a reliable image service
function generateFallbackImages(domainSlug: string, count: number): UnsplashImage[] {
  const domainImageIds = {
    'professional-scenes': [
      '1521737604893-d14cc237f11d', '1486406146926-c627a92ad1ab', '1522075469751-3a6694fb2f61',
      '1522252234503-e356532cafd5', '1504384308090-c894fdcc538d', '1488590528505-98d2b5aba04b',
      '1518770660439-4636190af475', '1487058792275-0ad4aaf24ca7', '1507003211169-0a1dd7228f2d',
      '1552664730-d307ca884979', '1560472354-b33ff0c44a43', '1553877522-43269d4ea984',
      '1559136555-9303baea8ebd', '1521737604893-d14cc237f11d', '1486406146926-c627a92ad1ab',
      '1522075469751-3a6694fb2f61', '1522252234503-e356532cafd5', '1504384308090-c894fdcc538d',
      '1488590528505-98d2b5aba04b', '1518770660439-4636190af475', '1487058792275-0ad4aaf24ca7',
      '1507003211169-0a1dd7228f2d', '1552664730-d307ca884979', '1560472354-b33ff0c44a43',
      '1553877522-43269d4ea984', '1559136555-9303baea8ebd'
    ],
    'emotions-expression': [
      '1524504388940-b1c1722653e1', '1503342217505-b0a15ec3261c', '1517841905240-472988babdf9',
      '1506794778202-cad84cf45f1d', '1506157382-97eda2d62296', '1556157382-97eda2d62296',
      '1507003211169-0a1dd7228f2d', '1494790108755-2616b612b786', '1506794778202-cad84cf45f1d',
      '1507003211169-0a1dd7228f2d', '1494790108755-2616b612b786', '1506794778202-cad84cf45f1d',
      '1507003211169-0a1dd7228f2d', '1494790108755-2616b612b786', '1506794778202-cad84cf45f1d',
      '1507003211169-0a1dd7228f2d', '1494790108755-2616b612b786', '1506794778202-cad84cf45f1d',
      '1507003211169-0a1dd7228f2d', '1494790108755-2616b612b786', '1506794778202-cad84cf45f1d',
      '1507003211169-0a1dd7228f2d', '1494790108755-2616b612b786', '1506794778202-cad84cf45f1d',
      '1507003211169-0a1dd7228f2d', '1494790108755-2616b612b786'
    ],
    'nature-environment': [
      '1500530855697-b586d89ba3ee', '1441974231531-c6227db76b6e', '1500534314209-a25ddb2bd429',
      '1501785888041-af3ef285b470', '1506905925346-21bda4d32df4', '1447752875215-b2761acb3c27',
      '1506905925346-21bda4d32df4', '1447752875215-b2761acb3c27', '1506905925346-21bda4d32df4',
      '1447752875215-b2761acb3c27', '1506905925346-21bda4d32df4', '1447752875215-b2761acb3c27',
      '1506905925346-21bda4d32df4', '1447752875215-b2761acb3c27', '1506905925346-21bda4d32df4',
      '1447752875215-b2761acb3c27', '1506905925346-21bda4d32df4', '1447752875215-b2761acb3c27',
      '1506905925346-21bda4d32df4', '1447752875215-b2761acb3c27', '1506905925346-21bda4d32df4',
      '1447752875215-b2761acb3c27', '1506905925346-21bda4d32df4', '1447752875215-b2761acb3c27',
      '1506905925346-21bda4d32df4', '1447752875215-b2761acb3c27'
    ],
    'technology-innovation': [
      '1518770660439-4636190af475', '1487058792275-0ad4aaf24ca7', '1504384308090-c894fdcc538d',
      '1488590528505-98d2b5aba04b', '1518770660439-4636190af475', '1487058792275-0ad4aaf24ca7',
      '1504384308090-c894fdcc538d', '1488590528505-98d2b5aba04b', '1518770660439-4636190af475',
      '1487058792275-0ad4aaf24ca7', '1504384308090-c894fdcc538d', '1488590528505-98d2b5aba04b',
      '1518770660439-4636190af475', '1487058792275-0ad4aaf24ca7', '1504384308090-c894fdcc538d',
      '1488590528505-98d2b5aba04b', '1518770660439-4636190af475', '1487058792275-0ad4aaf24ca7',
      '1504384308090-c894fdcc538d', '1488590528505-98d2b5aba04b', '1518770660439-4636190af475',
      '1487058792275-0ad4aaf24ca7', '1504384308090-c894fdcc538d', '1488590528505-98d2b5aba04b',
      '1518770660439-4636190af475', '1487058792275-0ad4aaf24ca7'
    ],
    'places-architecture': [
      '1467269204594-9661b134dd2b', '1472214103451-9374bd1c798e', '1489515217757-5fd1be406fef',
      '1491557345352-5929e343eb89', '1467269204594-9661b134dd2b', '1472214103451-9374bd1c798e',
      '1489515217757-5fd1be406fef', '1491557345352-5929e343eb89', '1467269204594-9661b134dd2b',
      '1472214103451-9374bd1c798e', '1489515217757-5fd1be406fef', '1491557345352-5929e343eb89',
      '1467269204594-9661b134dd2b', '1472214103451-9374bd1c798e', '1489515217757-5fd1be406fef',
      '1491557345352-5929e343eb89', '1467269204594-9661b134dd2b', '1472214103451-9374bd1c798e',
      '1489515217757-5fd1be406fef', '1491557345352-5929e343eb89', '1467269204594-9661b134dd2b',
      '1472214103451-9374bd1c798e', '1489515217757-5fd1be406fef', '1491557345352-5929e343eb89',
      '1467269204594-9661b134dd2b', '1472214103451-9374bd1c798e'
    ],
    'art-creativity': [
      '1526498460520-4c246339dccb', '1513364776144-60967b0f800f', '1527254059240-1f7e7d05b4e0',
      '1531665466865-7f30e61b1602', '1526498460520-4c246339dccb', '1513364776144-60967b0f800f',
      '1527254059240-1f7e7d05b4e0', '1531665466865-7f30e61b1602', '1526498460520-4c246339dccb',
      '1513364776144-60967b0f800f', '1527254059240-1f7e7d05b4e0', '1531665466865-7f30e61b1602',
      '1526498460520-4c246339dccb', '1513364776144-60967b0f800f', '1527254059240-1f7e7d05b4e0',
      '1531665466865-7f30e61b1602', '1526498460520-4c246339dccb', '1513364776144-60967b0f800f',
      '1527254059240-1f7e7d05b4e0', '1531665466865-7f30e61b1602', '1526498460520-4c246339dccb',
      '1513364776144-60967b0f800f', '1527254059240-1f7e7d05b4e0', '1531665466865-7f30e61b1602',
      '1526498460520-4c246339dccb', '1513364776144-60967b0f800f'
    ],
    'human-stories': [
      '1487412720507-e7ab37603c6f', '1508214751196-bcfd4ca60f91', '1504593811423-6dd665756598',
      '1470843810958-2da815d0e041', '1487412720507-e7ab37603c6f', '1508214751196-bcfd4ca60f91',
      '1504593811423-6dd665756598', '1470843810958-2da815d0e041', '1487412720507-e7ab37603c6f',
      '1508214751196-bcfd4ca60f91', '1504593811423-6dd665756598', '1470843810958-2da815d0e041',
      '1487412720507-e7ab37603c6f', '1508214751196-bcfd4ca60f91', '1504593811423-6dd665756598',
      '1470843810958-2da815d0e041', '1487412720507-e7ab37603c6f', '1508214751196-bcfd4ca60f91',
      '1504593811423-6dd665756598', '1470843810958-2da815d0e041', '1487412720507-e7ab37603c6f',
      '1508214751196-bcfd4ca60f91', '1504593811423-6dd665756598', '1470843810958-2da815d0e041',
      '1487412720507-e7ab37603c6f', '1508214751196-bcfd4ca60f91'
    ],
    'dream-fantasy': [
      '1501594907352-04cda38ebc29', '1500534314209-92ad3ebb6329', '1517816825585-142f1e4ec332',
      '1499244571948-7ccddb3583f1', '1501594907352-04cda38ebc29', '1500534314209-92ad3ebb6329',
      '1517816825585-142f1e4ec332', '1499244571948-7ccddb3583f1', '1501594907352-04cda38ebc29',
      '1500534314209-92ad3ebb6329', '1517816825585-142f1e4ec332', '1499244571948-7ccddb3583f1',
      '1501594907352-04cda38ebc29', '1500534314209-92ad3ebb6329', '1517816825585-142f1e4ec332',
      '1499244571948-7ccddb3583f1', '1501594907352-04cda38ebc29', '1500534314209-92ad3ebb6329',
      '1517816825585-142f1e4ec332', '1499244571948-7ccddb3583f1', '1501594907352-04cda38ebc29',
      '1500534314209-92ad3ebb6329', '1517816825585-142f1e4ec332', '1499244571948-7ccddb3583f1',
      '1501594907352-04cda38ebc29', '1500534314209-92ad3ebb6329'
    ]
  };

  const imageIds = domainImageIds[domainSlug as keyof typeof domainImageIds] || domainImageIds['professional-scenes'];
  
  return Array.from({ length: count }, (_, i) => {
    const imageId = imageIds[i % imageIds.length];
    const timestamp = Date.now();
    const randomSeed = Math.floor(Math.random() * 1000000);
    const uniqueId = `${timestamp}-${randomSeed}-${i}`;
    
    return {
      id: `${domainSlug}-image-${i + 1}`,
      urls: {
        regular: `https://images.unsplash.com/photo-${imageId}?auto=format&fit=crop&w=1600&h=1200&q=80&sig=${uniqueId}`,
        small: `https://images.unsplash.com/photo-${imageId}?auto=format&fit=crop&w=400&h=300&q=80&sig=${uniqueId}`,
        thumb: `https://images.unsplash.com/photo-${imageId}?auto=format&fit=crop&w=200&h=150&q=80&sig=${uniqueId}`
      },
      alt_description: `Domain-specific ${domainSlug.replace('-', ' ')} image ${i + 1}`,
      description: `Dynamic ${domainSlug.replace('-', ' ')} image for communication practice`
    };
  });
}
