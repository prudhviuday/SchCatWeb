export interface Watchlist { name: string; symbols: string[] }
export interface SavedQuery { name: string; queryCode: string; symbols: string[] }
export interface ScreenerLibrary { version: 1; watchlists: Watchlist[]; queries: SavedQuery[] }
export const SCREENER_LIBRARY_KEY = "schcatweb.screener-library.v1";
export const EMPTY_SCREENER_LIBRARY: ScreenerLibrary = { version: 1, watchlists: [], queries: [] };

function cleanName(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(label + " name must be non-empty.");
  const name = value.trim();
  if (name.length > 80) throw new Error(label + " name must be 80 characters or fewer.");
  return name;
}
function cleanSymbols(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("Symbols must be an array.");
  return [...new Set(value.filter((v): v is string => typeof v === "string").map(v => v.trim().toUpperCase()).filter(Boolean))];
}
function uniqueNames<T extends {name:string}>(items:T[], label:string):T[] {
  const seen=new Set<string>();
  for(const item of items){const key=item.name.toLocaleLowerCase();if(seen.has(key))throw new Error("Duplicate "+label+" name: "+item.name);seen.add(key);}
  return items;
}
export function validateScreenerLibrary(value:unknown):ScreenerLibrary {
  if(!value||typeof value!=="object")throw new Error("Invalid screener backup.");
  const input=value as Record<string,unknown>;
  if(input.version!==1||!Array.isArray(input.watchlists)||!Array.isArray(input.queries))throw new Error("Unsupported screener backup format.");
  const watchlists=input.watchlists.map(raw=>{if(!raw||typeof raw!=="object")throw new Error("Invalid watchlist entry.");const x=raw as Record<string,unknown>;return{name:cleanName(x.name,"Watchlist"),symbols:cleanSymbols(x.symbols)};});
  const queries=input.queries.map(raw=>{if(!raw||typeof raw!=="object")throw new Error("Invalid query entry.");const x=raw as Record<string,unknown>;return{name:cleanName(x.name,"Query"),queryCode:typeof x.queryCode==="string"?x.queryCode.trim():"",symbols:cleanSymbols(x.symbols)};});
  return{version:1,watchlists:uniqueNames(watchlists,"watchlist"),queries:uniqueNames(queries,"query")};
}
export function loadScreenerLibrary(storage?:Pick<Storage,"getItem">):ScreenerLibrary {
  try{const target=storage??(typeof localStorage==="undefined"?undefined:localStorage);const raw=target?.getItem(SCREENER_LIBRARY_KEY);return raw?validateScreenerLibrary(JSON.parse(raw)):structuredClone(EMPTY_SCREENER_LIBRARY);}
  catch{return structuredClone(EMPTY_SCREENER_LIBRARY);}
}
export function saveScreenerLibrary(library:ScreenerLibrary,storage?:Pick<Storage,"setItem">):ScreenerLibrary {
  const clean=validateScreenerLibrary(library);const target=storage??(typeof localStorage==="undefined"?undefined:localStorage);if(!target)throw new Error("Browser storage unavailable.");target.setItem(SCREENER_LIBRARY_KEY,JSON.stringify(clean));return clean;
}
export function addSymbolToWatchlist(library:ScreenerLibrary,name:string,symbol:string):ScreenerLibrary {
  const watchlistName=cleanName(name,"Watchlist");const stock=symbol.trim().toUpperCase();if(!stock)throw new Error("Enter a stock symbol.");
  const found=library.watchlists.find(x=>x.name.toLowerCase()===watchlistName.toLowerCase());
  const watchlists=found?library.watchlists.map(x=>x===found?{...x,symbols:[...new Set([...x.symbols,stock])]}:x):[...library.watchlists,{name:watchlistName,symbols:[stock]}];
  return validateScreenerLibrary({...library,watchlists});
}
export function removeSymbolFromWatchlist(library:ScreenerLibrary,name:string,symbol:string):ScreenerLibrary {
  return validateScreenerLibrary({...library,watchlists:library.watchlists.map(x=>x.name===name?{...x,symbols:x.symbols.filter(s=>s!==symbol.toUpperCase())}:x)});
}
export function upsertSavedQuery(library:ScreenerLibrary,query:SavedQuery):ScreenerLibrary {
  const name=cleanName(query.name,"Query");const found=library.queries.find(x=>x.name.toLowerCase()===name.toLowerCase());
  const item={...query,name,symbols:cleanSymbols(query.symbols)};
  return validateScreenerLibrary({...library,queries:found?library.queries.map(x=>x===found?item:x):[...library.queries,item]});
}
export function removeSavedQuery(library:ScreenerLibrary,name:string):ScreenerLibrary {
  return validateScreenerLibrary({...library,queries:library.queries.filter(x=>x.name!==name)});
}
export function mergeScreenerLibraries(a:ScreenerLibrary,b:ScreenerLibrary):ScreenerLibrary {
  const merge=<T extends{name:string}>(left:T[],right:T[])=>{const map=new Map(left.map(x=>[x.name.toLowerCase(),x]));for(const x of right)map.set(x.name.toLowerCase(),x);return[...map.values()];};
  return validateScreenerLibrary({version:1,watchlists:merge(a.watchlists,b.watchlists),queries:merge(a.queries,b.queries)});
}
export function serializeScreenerLibrary(library:ScreenerLibrary):string{return JSON.stringify(validateScreenerLibrary(library),null,2);}
export function parseScreenerLibraryJson(json:string):ScreenerLibrary{let parsed:unknown;try{parsed=JSON.parse(json);}catch{throw new Error("Backup is not valid JSON.");}return validateScreenerLibrary(parsed);}
function parseCsv(csv:string):string[][] {
  const rows:string[][]=[];let row:string[]=[];let cell="";let quoted=false;
  for(let i=0;i<csv.length;i++){const c=csv[i];if(quoted){if(c==='"'&&csv[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}
  else if(c==='"'&&cell==="")quoted=true;else if(c===","){row.push(cell);cell="";}else if(c==="\n"||c==="\r"){if(c==="\r"&&csv[i+1]==="\n")i++;row.push(cell);cell="";if(row.some(x=>x.trim()))rows.push(row);row=[];}else cell+=c;}
  row.push(cell);if(row.some(x=>x.trim()))rows.push(row);if(quoted)throw new Error("CSV has an unterminated quoted field.");return rows;
}
export function parseWatchlistsCsv(csv:string):Watchlist[] {
  const rows=parseCsv(csv);if(rows.length<2)throw new Error("CSV needs a header and data rows.");const h=rows[0].map(x=>x.trim().toLowerCase());const ni=h.indexOf("watchlist"),si=h.indexOf("symbol");
  if(ni<0||si<0)throw new Error("CSV needs Watchlist and Symbol columns.");
  const grouped=new Map<string,string[]>();for(const r of rows.slice(1)){const n=r[ni]?.trim(),s=r[si]?.trim().toUpperCase();if(n&&s)grouped.set(n,[...(grouped.get(n)??[]),s]);}
  return uniqueNames([...grouped].map(([name,symbols])=>({name,symbols:[...new Set(symbols)]})),"watchlist");
}
export function serializeWatchlistsCsv(items:readonly Watchlist[]):string {
  const q=(s:string)=>'"'+s.replaceAll('"','""')+'"';return["Watchlist,Symbol",...items.flatMap(x=>x.symbols.map(s=>q(x.name)+","+q(s)))].join("\r\n");
}
