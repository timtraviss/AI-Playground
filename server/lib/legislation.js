const BASE = 'https://api.legislation.govt.nz';

const ACT_PATHS = {
  'Arms Act 1983': 'act/public/1983/0044',
  'Crimes Act 1961': 'act/public/1961/0043',
  'Evidence Act 2006': 'act/public/2006/0069',
  'Oranga Tamariki Act 1989': 'act/public/1989/0024',
  'Search and Surveillance Act 2012': 'act/public/2012/0024',
  "Victims' Rights Act 2002": 'act/public/2002/0039',
  'Policing Act 2008': 'act/public/2008/0072',
  'Land Transport Act 1998': 'act/public/1998/0110',
  'NZ Bill of Rights Act 1990': 'act/public/1990/0109',
};

function authHeaders(accept = 'application/xml') {
  return {
    Authorization: `Bearer ${process.env.Legislation_API_KEY}`,
    Accept: accept,
  };
}

function stripXml(xml) {
  return xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve an Act name to its API path.
 * Returns null if not in the known list.
 */
export function resolveActPath(actName) {
  // Exact match
  if (ACT_PATHS[actName]) return ACT_PATHS[actName];
  // Case-insensitive partial match
  const lower = actName.toLowerCase();
  for (const [key, path] of Object.entries(ACT_PATHS)) {
    if (key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())) {
      return path;
    }
  }
  return null;
}

/**
 * Fetch a specific section from an Act.
 * Returns plain-text statutory content.
 */
export async function getSection(actPath, sectionNumber) {
  const url = `${BASE}/v1/${actPath}/latest/section/${sectionNumber}`;
  const resp = await fetch(url, { headers: authHeaders('application/xml'), signal: AbortSignal.timeout(15000) });

  if (resp.status === 404) {
    return `[Section ${sectionNumber} not found in ${actPath} — the section may have been renumbered]`;
  }
  if (!resp.ok) {
    throw new Error(`Legislation API error ${resp.status} for ${url}`);
  }

  const xml = await resp.text();
  return stripXml(xml);
}

/**
 * Search for an Act by title.
 * Returns JSON results from the API.
 */
export async function searchAct(query) {
  const url = `${BASE}/v1/search?q=${encodeURIComponent(query)}&type=act&status=inforce`;
  const resp = await fetch(url, { headers: authHeaders('application/json'), signal: AbortSignal.timeout(15000) });
  if (!resp.ok) throw new Error(`Legislation search error ${resp.status}`);
  return resp.json();
}

/**
 * Fetch the table of contents for an Act.
 */
export async function getActToc(actPath) {
  const url = `${BASE}/v1/${actPath}/latest`;
  const resp = await fetch(url, { headers: authHeaders('application/json'), signal: AbortSignal.timeout(15000) });
  if (!resp.ok) throw new Error(`Legislation TOC error ${resp.status}`);
  return resp.json();
}

/**
 * Given an Act name and optional section number from a claim,
 * fetch the best-matching statutory text.
 * Returns { actPath, sectionText, retrievedAt }
 */
export async function fetchStatutoryText(actName, sectionNumber) {
  const actPath = resolveActPath(actName);
  const retrievedAt = new Date().toISOString().split('T')[0];

  if (!actPath) {
    // Try searching
    try {
      const results = await searchAct(actName);
      const first = results?.results?.[0];
      if (first) {
        const foundPath = first.identifier || first.id;
        if (foundPath && sectionNumber) {
          const text = await getSection(foundPath, sectionNumber);
          return { actPath: foundPath, sectionText: text, retrievedAt };
        }
        return { actPath: foundPath || actName, sectionText: `[Act found via search but no section fetched: ${actName}]`, retrievedAt };
      }
    } catch {}
    return { actPath: actName, sectionText: `[Act not found in legislation.govt.nz: ${actName}]`, retrievedAt };
  }

  if (sectionNumber) {
    const text = await getSection(actPath, String(sectionNumber).replace(/^s/i, ''));
    return { actPath, sectionText: text, retrievedAt };
  }

  return { actPath, sectionText: `[No section number — general reference to ${actName}]`, retrievedAt };
}

export { ACT_PATHS };
