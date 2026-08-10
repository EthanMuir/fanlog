// One-off generator for teams.js. Keeps logo URLs consistent and avoids
// hand-transcription errors across ~130 teams. Run: node scripts/gen-teams.mjs
// Logo sources (all verified reachable at build time):
//   NFL/NBA/NHL/MLB -> https://a.espncdn.com/i/teamlogos/<lg>/500/<abbr>.png
//   MLS             -> https://a.espncdn.com/i/teamlogos/soccer/500/<espnId>.png
//   CFL             -> vendored locally in public/logos/cfl/<id>.png (ESPN has no CFL logos)
import { writeFileSync } from 'node:fs';

const espn = (lg, abbr) => `https://a.espncdn.com/i/teamlogos/${lg}/500/${abbr}.png`;
const soccer = (id) => `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png`;
const cfl = (id) => `/logos/cfl/${id}.png`;

// [id, name, short, city, status, logoKey, primary, secondary, text, founded]
const data = {
  nfl: ['NFL', 'nfl', [
    ['chiefs','Kansas City Chiefs','KC','Kansas City','champs','kc','#E31837','#FFB81C','#FFFFFF',1960],
    ['eagles','Philadelphia Eagles','PHI','Philadelphia','champs','phi','#004C54','#A5ACAF','#FFFFFF',1933],
    ['cowboys','Dallas Cowboys','DAL','Dallas','heartbreak','dal','#003594','#869397','#FFFFFF',1960],
    ['niners','San Francisco 49ers','SF','San Francisco','heartbreak','sf','#AA0000','#B3995D','#FFFFFF',1946],
    ['packers','Green Bay Packers','GB','Green Bay','standard','gb','#203731','#FFB612','#FFFFFF',1919],
    ['bills','Buffalo Bills','BUF','Buffalo','heartbreak','buf','#00338D','#C60C30','#FFFFFF',1960],
    ['seahawks','Seattle Seahawks','SEA','Seattle','standard','sea','#002244','#69BE28','#FFFFFF',1976],
    ['patriots','New England Patriots','NE','Boston','powerhouse','ne','#002244','#C60C30','#FFFFFF',1960],
    ['raiders','Las Vegas Raiders','LV','Las Vegas','standard','lv','#000000','#A5ACAF','#FFFFFF',1960],
    ['giants_nfl','New York Giants','NYG','New York','standard','nyg','#0B2265','#A71930','#FFFFFF',1925],
    ['dolphins','Miami Dolphins','MIA','Miami','standard','mia','#008E97','#FC4C02','#FFFFFF',1966],
    ['jets','New York Jets','NYJ','New York','standard','nyj','#125740','#FFFFFF','#FFFFFF',1960],
    ['ravens','Baltimore Ravens','BAL','Baltimore','champs','bal','#241773','#000000','#FFFFFF',1996],
    ['bengals','Cincinnati Bengals','CIN','Cincinnati','heartbreak','cin','#FB4F14','#000000','#FFFFFF',1968],
    ['browns','Cleveland Browns','CLE','Cleveland','heartbreak','cle','#311D00','#FF3C00','#FFFFFF',1946],
    ['steelers','Pittsburgh Steelers','PIT','Pittsburgh','powerhouse','pit','#FFB612','#101820','#000000',1933],
    ['texans','Houston Texans','HOU','Houston','standard','hou','#03202F','#A71930','#FFFFFF',2002],
    ['colts','Indianapolis Colts','IND','Indianapolis','standard','ind','#002C5F','#A2AAAD','#FFFFFF',1953],
    ['jaguars','Jacksonville Jaguars','JAX','Jacksonville','standard','jax','#101820','#D7A22A','#FFFFFF',1995],
    ['titans','Tennessee Titans','TEN','Nashville','standard','ten','#0C2340','#4B92DB','#FFFFFF',1960],
    ['broncos','Denver Broncos','DEN','Denver','champs','den','#FB4F14','#002244','#FFFFFF',1960],
    ['chargers','Los Angeles Chargers','LAC','Los Angeles','standard','lac','#0080C6','#FFC20E','#FFFFFF',1960],
    ['commanders','Washington Commanders','WAS','Washington','standard','wsh','#5A1414','#FFB612','#FFFFFF',1932],
    ['lions','Detroit Lions','DET','Detroit','standard','det','#0076B6','#B0B7BC','#FFFFFF',1930],
    ['vikings','Minnesota Vikings','MIN','Minneapolis','heartbreak','min','#4F2683','#FFC62F','#FFFFFF',1961],
    ['bears','Chicago Bears','CHI','Chicago','standard','chi','#0B162A','#C83803','#FFFFFF',1920],
    ['buccaneers','Tampa Bay Buccaneers','TB','Tampa Bay','champs','tb','#D50A0A','#34302B','#FFFFFF',1976],
    ['saints','New Orleans Saints','NO','New Orleans','standard','no','#D3BC8D','#101820','#000000',1967],
    ['falcons','Atlanta Falcons','ATL','Atlanta','heartbreak','atl','#A71930','#000000','#FFFFFF',1966],
    ['panthers','Carolina Panthers','CAR','Charlotte','standard','car','#0085CA','#101820','#FFFFFF',1995],
    ['rams','Los Angeles Rams','LAR','Los Angeles','champs','lar','#003594','#FFA300','#FFFFFF',1936],
    ['cardinals_nfl','Arizona Cardinals','ARI','Phoenix','standard','ari','#97233F','#000000','#FFFFFF',1898],
  ]],
  nba: ['NBA', 'nba', [
    ['lakers','Los Angeles Lakers','LAL','Los Angeles','champs','lal','#552583','#FDB927','#FFFFFF',1947],
    ['celtics','Boston Celtics','BOS','Boston','champs','bos','#007A33','#BA9653','#FFFFFF',1946],
    ['warriors','Golden State Warriors','GSW','San Francisco','champs','gsw','#1D428A','#FFC72C','#FFFFFF',1946],
    ['bulls','Chicago Bulls','CHI','Chicago','standard','chi','#CE1141','#000000','#FFFFFF',1966],
    ['raptors','Toronto Raptors','TOR','Toronto','standard','tor','#CE1141','#A1A1A4','#FFFFFF',1995],
    ['heat','Miami Heat','MIA','Miami','standard','mia','#98002E','#F9A01B','#FFFFFF',1988],
    ['knicks','New York Knicks','NYK','New York','heartbreak','nyk','#006BB6','#F58426','#FFFFFF',1946],
    ['bucks','Milwaukee Bucks','MIL','Milwaukee','standard','mil','#00471B','#EEE1C6','#FFFFFF',1968],
    ['suns','Phoenix Suns','PHX','Phoenix','heartbreak','phx','#1D1160','#E56020','#FFFFFF',1968],
    ['nets','Brooklyn Nets','BKN','New York','heartbreak','bkn','#000000','#FFFFFF','#FFFFFF',1967],
    ['sixers','Philadelphia 76ers','PHI','Philadelphia','standard','phi','#006BB6','#ED174C','#FFFFFF',1949],
    ['cavaliers','Cleveland Cavaliers','CLE','Cleveland','champs','cle','#860038','#FDBB30','#FFFFFF',1970],
    ['pistons','Detroit Pistons','DET','Detroit','standard','det','#C8102E','#1D42BA','#FFFFFF',1941],
    ['pacers','Indiana Pacers','IND','Indianapolis','heartbreak','ind','#002D62','#FDBB30','#FFFFFF',1967],
    ['hawks','Atlanta Hawks','ATL','Atlanta','standard','atl','#E03A3E','#C1D32F','#FFFFFF',1946],
    ['hornets','Charlotte Hornets','CHA','Charlotte','standard','cha','#1D1160','#00788C','#FFFFFF',1988],
    ['magic','Orlando Magic','ORL','Orlando','standard','orl','#0077C0','#C4CED4','#FFFFFF',1989],
    ['wizards','Washington Wizards','WAS','Washington','standard','wsh','#002B5C','#E31837','#FFFFFF',1961],
    ['nuggets','Denver Nuggets','DEN','Denver','champs','den','#0E2240','#FEC524','#FFFFFF',1967],
    ['timberwolves','Minnesota Timberwolves','MIN','Minneapolis','standard','min','#0C2340','#236192','#FFFFFF',1989],
    ['thunder','Oklahoma City Thunder','OKC','Oklahoma City','champs','okc','#007AC1','#EF3B24','#FFFFFF',1967],
    ['blazers','Portland Trail Blazers','POR','Portland','standard','por','#E03A3E','#000000','#FFFFFF',1970],
    ['jazz','Utah Jazz','UTA','Salt Lake City','standard','utah','#002B5C','#00471B','#FFFFFF',1974],
    ['clippers','LA Clippers','LAC','Los Angeles','standard','lac','#C8102E','#1D428A','#FFFFFF',1970],
    ['kings_nba','Sacramento Kings','SAC','Sacramento','standard','sac','#5A2D81','#63727A','#FFFFFF',1945],
    ['mavericks','Dallas Mavericks','DAL','Dallas','champs','dal','#00538C','#002B5E','#FFFFFF',1980],
    ['rockets','Houston Rockets','HOU','Houston','standard','hou','#CE1141','#000000','#FFFFFF',1967],
    ['grizzlies','Memphis Grizzlies','MEM','Memphis','standard','mem','#5D76A9','#12173F','#FFFFFF',1995],
    ['pelicans','New Orleans Pelicans','NOP','New Orleans','standard','no','#0C2340','#C8102E','#FFFFFF',2002],
    ['spurs','San Antonio Spurs','SAS','San Antonio','powerhouse','sa','#C4CED4','#000000','#000000',1967],
  ]],
  nhl: ['NHL', 'nhl', [
    ['leafs','Toronto Maple Leafs','TOR','Toronto','heartbreak','tor','#00205B','#FFFFFF','#FFFFFF',1917],
    ['bruins','Boston Bruins','BOS','Boston','standard','bos','#111111','#FCB827','#FFFFFF',1924],
    ['blackhawks','Chicago Blackhawks','CHI','Chicago','standard','chi','#CF0A2C','#000000','#FFFFFF',1926],
    ['canadiens','Montreal Canadiens','MTL','Montreal','heartbreak','mtl','#AF1E2D','#192168','#FFFFFF',1909],
    ['canucks','Vancouver Canucks','VAN','Vancouver','heartbreak','van','#001F5B','#008752','#FFFFFF',1970],
    ['knights','Vegas Golden Knights','VGK','Las Vegas','champs','vgk','#B4975A','#333F48','#FFFFFF',2017],
    ['rangers','New York Rangers','NYR','New York','heartbreak','nyr','#0038A8','#CE1126','#FFFFFF',1926],
    ['avalanche','Colorado Avalanche','COL','Denver','standard','col','#6F263D','#236192','#FFFFFF',1972],
    ['oilers','Edmonton Oilers','EDM','Edmonton','heartbreak','edm','#041E42','#FF4C00','#FFFFFF',1972],
    ['penguins','Pittsburgh Penguins','PIT','Pittsburgh','standard','pit','#111111','#FCB827','#FFFFFF',1967],
    ['ducks','Anaheim Ducks','ANA','Anaheim','standard','ana','#F47A38','#B09862','#FFFFFF',1993],
    ['sabres','Buffalo Sabres','BUF','Buffalo','heartbreak','buf','#003087','#FFB81C','#FFFFFF',1970],
    ['flames','Calgary Flames','CGY','Calgary','standard','cgy','#C8102E','#F1BE48','#FFFFFF',1972],
    ['hurricanes','Carolina Hurricanes','CAR','Raleigh','standard','car','#CC0000','#000000','#FFFFFF',1979],
    ['bluejackets','Columbus Blue Jackets','CBJ','Columbus','standard','cbj','#002654','#CE1126','#FFFFFF',2000],
    ['stars','Dallas Stars','DAL','Dallas','standard','dal','#006847','#8F8F8C','#FFFFFF',1967],
    ['redwings','Detroit Red Wings','DET','Detroit','standard','det','#CE1126','#FFFFFF','#FFFFFF',1926],
    ['panthers_nhl','Florida Panthers','FLA','Sunrise','champs','fla','#041E42','#C8102E','#FFFFFF',1993],
    ['kings_nhl','Los Angeles Kings','LAK','Los Angeles','standard','la','#111111','#A2AAAD','#FFFFFF',1967],
    ['wild','Minnesota Wild','MIN','Saint Paul','standard','min','#154734','#A6192E','#FFFFFF',2000],
    ['predators','Nashville Predators','NSH','Nashville','standard','nsh','#FFB81C','#041E42','#000000',1998],
    ['devils','New Jersey Devils','NJD','Newark','standard','nj','#CE1126','#000000','#FFFFFF',1974],
    ['islanders','New York Islanders','NYI','New York','standard','nyi','#00539B','#F47D30','#FFFFFF',1972],
    ['senators','Ottawa Senators','OTT','Ottawa','standard','ott','#C52032','#000000','#FFFFFF',1992],
    ['flyers','Philadelphia Flyers','PHI','Philadelphia','standard','phi','#F74902','#000000','#FFFFFF',1967],
    ['sharks','San Jose Sharks','SJS','San Jose','standard','sj','#006D75','#EA7200','#FFFFFF',1991],
    ['kraken','Seattle Kraken','SEA','Seattle','standard','sea','#001628','#99D9D9','#FFFFFF',2021],
    ['blues','St. Louis Blues','STL','St. Louis','champs','stl','#002F87','#FCB514','#FFFFFF',1967],
    ['lightning','Tampa Bay Lightning','TBL','Tampa Bay','champs','tb','#002868','#FFFFFF','#FFFFFF',1992],
    ['utah_hc','Utah Hockey Club','UTA','Salt Lake City','standard','utah','#71AFE5','#010101','#FFFFFF',2024],
    ['capitals','Washington Capitals','WSH','Washington','champs','wsh','#041E42','#C8102E','#FFFFFF',1974],
    ['jets_nhl','Winnipeg Jets','WPG','Winnipeg','standard','wpg','#041E42','#004C97','#FFFFFF',1999],
  ]],
  mlb: ['MLB', 'mlb', [
    ['yankees','New York Yankees','NYY','New York','powerhouse','nyy','#0C2340','#C4CED4','#FFFFFF',1901],
    ['redsox','Boston Red Sox','BOS','Boston','standard','bos','#BD3039','#0C2340','#FFFFFF',1901],
    ['dodgers','Los Angeles Dodgers','LAD','Los Angeles','champs','lad','#005A9C','#A5ACAF','#FFFFFF',1883],
    ['cubs','Chicago Cubs','CHC','Chicago','standard','chc','#0E3386','#CC3433','#FFFFFF',1876],
    ['giants_mlb','San Francisco Giants','SF','San Francisco','standard','sf','#FD5A1E','#27251F','#FFFFFF',1883],
    ['bluejays','Toronto Blue Jays','TOR','Toronto','standard','tor','#134A8E','#1D2D5C','#FFFFFF',1977],
    ['braves','Atlanta Braves','ATL','Atlanta','standard','atl','#13274F','#CE1141','#FFFFFF',1876],
    ['astros','Houston Astros','HOU','Houston','champs','hou','#002D62','#EB6E1F','#FFFFFF',1962],
    ['mets','New York Mets','NYM','New York','heartbreak','nym','#002D62','#FF5910','#FFFFFF',1962],
    ['cardinals','St. Louis Cardinals','STL','St. Louis','standard','stl','#C41E3A','#0C2340','#FFFFFF',1882],
    ['orioles','Baltimore Orioles','BAL','Baltimore','standard','bal','#DF4601','#000000','#FFFFFF',1901],
    ['rays','Tampa Bay Rays','TB','St. Petersburg','standard','tb','#092C5C','#8FBCE6','#FFFFFF',1998],
    ['guardians','Cleveland Guardians','CLE','Cleveland','standard','cle','#0C2340','#E31937','#FFFFFF',1901],
    ['tigers','Detroit Tigers','DET','Detroit','standard','det','#0C2340','#FA4616','#FFFFFF',1901],
    ['royals','Kansas City Royals','KC','Kansas City','standard','kc','#004687','#BD9B60','#FFFFFF',1969],
    ['twins','Minnesota Twins','MIN','Minneapolis','standard','min','#002B5C','#D31145','#FFFFFF',1901],
    ['whitesox','Chicago White Sox','CHW','Chicago','standard','chw','#27251F','#C4CED4','#FFFFFF',1901],
    ['angels','Los Angeles Angels','LAA','Anaheim','standard','laa','#003263','#BA0021','#FFFFFF',1961],
    ['athletics','Athletics','ATH','Sacramento','standard','ath','#003831','#EFB21E','#FFFFFF',1901],
    ['mariners','Seattle Mariners','SEA','Seattle','standard','sea','#0C2C56','#005C5C','#FFFFFF',1977],
    ['rangers_mlb','Texas Rangers','TEX','Arlington','champs','tex','#003278','#C0111F','#FFFFFF',1961],
    ['phillies','Philadelphia Phillies','PHI','Philadelphia','standard','phi','#E81828','#002D72','#FFFFFF',1883],
    ['marlins','Miami Marlins','MIA','Miami','standard','mia','#00A3E0','#EF3340','#FFFFFF',1993],
    ['nationals','Washington Nationals','WSH','Washington','standard','wsh','#AB0003','#14225A','#FFFFFF',1969],
    ['brewers','Milwaukee Brewers','MIL','Milwaukee','standard','mil','#12284B','#FFC52F','#FFFFFF',1969],
    ['reds','Cincinnati Reds','CIN','Cincinnati','standard','cin','#C6011F','#000000','#FFFFFF',1881],
    ['pirates','Pittsburgh Pirates','PIT','Pittsburgh','standard','pit','#27251F','#FDB827','#FFFFFF',1882],
    ['padres','San Diego Padres','SD','San Diego','standard','sd','#2F241D','#FFC425','#FFFFFF',1969],
    ['diamondbacks','Arizona Diamondbacks','ARI','Phoenix','standard','ari','#A71930','#E3D4AD','#FFFFFF',1998],
    ['rockies','Colorado Rockies','COL','Denver','standard','col','#333366','#C4CED4','#FFFFFF',1993],
  ]],
  mls: ['MLS', 'mls', [
    ['miami','Inter Miami CF','MIA','Miami','champs','20232','#F7B5CD','#231F20','#000000',2018],
    ['galaxy','LA Galaxy','LA','Los Angeles','standard','187','#00245C','#FFD200','#FFFFFF',1996],
    ['sounders','Seattle Sounders FC','SEA','Seattle','standard','9726','#005C5C','#85B623','#FFFFFF',2009],
    ['lafc','Los Angeles FC','LAFC','Los Angeles','champs','18966','#000000','#C39C5E','#FFFFFF',2014],
    ['timbers','Portland Timbers','POR','Portland','standard','9723','#004812','#EAE228','#FFFFFF',2011],
    ['atlanta_utd','Atlanta United FC','ATL','Atlanta','standard','18418','#80000A','#A29061','#FFFFFF',2014],
    ['toronto_fc','Toronto FC','TOR','Toronto','heartbreak','7318','#E31937','#A3A7AC','#FFFFFF',2007],
    ['nycfc','New York City FC','NYC','New York','standard','17606','#6CACE4','#041E42','#000000',2013],
    ['crew','Columbus Crew','CLB','Columbus','champs','183','#FED102','#000000','#000000',1996],
    ['cincinnati','FC Cincinnati','CIN','Cincinnati','standard','18267','#F05323','#263B80','#FFFFFF',2015],
    ['austin','Austin FC','ATX','Austin','standard','20906','#00B140','#000000','#FFFFFF',2021],
    ['cf_montreal','CF Montréal','MTL','Montreal','standard','9720','#00529B','#000000','#FFFFFF',2012],
    ['charlotte_fc','Charlotte FC','CLT','Charlotte','standard','21300','#1A85C8','#000000','#FFFFFF',2022],
    ['fire','Chicago Fire FC','CHI','Chicago','standard','182','#141B4D','#C8102E','#FFFFFF',1998],
    ['rapids','Colorado Rapids','COL','Commerce City','standard','184','#862633','#9CC2EA','#FFFFFF',1996],
    ['dc_united','D.C. United','DC','Washington','standard','193','#231F20','#EF3E42','#FFFFFF',1996],
    ['fc_dallas','FC Dallas','DAL','Frisco','standard','185','#E81F3E','#1F49A6','#FFFFFF',1996],
    ['dynamo','Houston Dynamo FC','HOU','Houston','standard','6077','#FF6B00','#101820','#FFFFFF',2005],
    ['minnesota_utd','Minnesota United FC','MIN','Saint Paul','standard','17362','#8CD2F4','#231F20','#000000',2015],
    ['nashville_sc','Nashville SC','NSH','Nashville','standard','18986','#ECE83A','#1D1D42','#000000',2016],
    ['revolution','New England Revolution','NE','Foxborough','standard','189','#0A2240','#CE0E2D','#FFFFFF',1996],
    ['orlando_city','Orlando City SC','ORL','Orlando','standard','12011','#633492','#FDE192','#FFFFFF',2010],
    ['philadelphia_union','Philadelphia Union','PHI','Chester','standard','10739','#002D55','#B19B69','#FFFFFF',2008],
    ['rsl','Real Salt Lake','RSL','Sandy','standard','4771','#B30838','#013A81','#FFFFFF',2004],
    ['red_bulls','New York Red Bulls','RBNY','Harrison','standard','190','#ED1E36','#002D6E','#FFFFFF',1994],
    ['san_diego_fc','San Diego FC','SD','San Diego','standard','22529','#00B4E3','#001F3F','#FFFFFF',2023],
    ['earthquakes','San Jose Earthquakes','SJ','San Jose','standard','191','#0051BA','#000000','#FFFFFF',1994],
    ['sporting_kc','Sporting Kansas City','SKC','Kansas City','standard','186','#91B0D5','#002F65','#FFFFFF',1995],
    ['stlouis_city','St. Louis City SC','STL','St. Louis','standard','21812','#DC0714','#001A4B','#FFFFFF',2019],
    ['vancouver_wc','Vancouver Whitecaps FC','VAN','Vancouver','standard','9727','#00245E','#98A8B4','#FFFFFF',1974],
  ]],
  cfl: ['CFL', 'cfl', [
    ['bclions','BC Lions','BC','Vancouver','standard','bclions','#F15C22','#231F20','#FFFFFF',1954],
    ['stampeders','Calgary Stampeders','CGY','Calgary','standard','stampeders','#C8102E','#000000','#FFFFFF',1945],
    ['elks','Edmonton Elks','EDM','Edmonton','standard','elks','#24583F','#F2A900','#FFFFFF',1949],
    ['roughriders','Saskatchewan Roughriders','SSK','Regina','heartbreak','roughriders','#007A33','#000000','#FFFFFF',1910],
    ['bluebombers','Winnipeg Blue Bombers','WPG','Winnipeg','standard','bluebombers','#041E42','#FFB81C','#FFFFFF',1930],
    ['ticats','Hamilton Tiger-Cats','HAM','Hamilton','standard','ticats','#000000','#FFB81C','#FFFFFF',1950],
    ['argonauts','Toronto Argonauts','TOR','Toronto','champs','argonauts','#14284B','#A2AAAD','#FFFFFF',1873],
    ['redblacks','Ottawa Redblacks','OTT','Ottawa','standard','redblacks','#000000','#C8102E','#FFFFFF',2014],
    ['alouettes','Montreal Alouettes','MTL','Montreal','champs','alouettes','#0057B8','#E4002B','#FFFFFF',1946],
  ]],
};

const logoFor = (lg, key) =>
  lg === 'mls' ? soccer(key) : lg === 'cfl' ? cfl(key) : espn(data[lg][1], key);

let out = '// AUTO-GENERATED by scripts/gen-teams.mjs — edit that script, not this file.\n';
out += 'export const sportsData = {\n';
for (const lg of Object.keys(data)) {
  const [name, , teams] = data[lg];
  out += `  ${lg}: {\n    name: ${JSON.stringify(name)},\n    teams: [\n`;
  for (const [id, tname, short, city, status, key, primary, secondary, text, founded] of teams) {
    out += `      { id: ${JSON.stringify(id)}, name: ${JSON.stringify(tname)}, short: ${JSON.stringify(short)}, city: ${JSON.stringify(city)}, status: ${JSON.stringify(status)}, logo: ${JSON.stringify(logoFor(lg, key))}, primary: ${JSON.stringify(primary)}, secondary: ${JSON.stringify(secondary)}, text: ${JSON.stringify(text)}, founded: ${founded} },\n`;
  }
  out += `    ]\n  },\n`;
}
out += '};\n';

writeFileSync(new URL('../teams.js', import.meta.url), out);

// Sanity: assert unique ids across all leagues.
const ids = Object.values(data).flatMap(([, , ts]) => ts.map(t => t[0]));
const dupes = ids.filter((x, i) => ids.indexOf(x) !== i);
console.log(`leagues=${Object.keys(data).length} teams=${ids.length} dupes=${[...new Set(dupes)].join(',') || 'none'}`);
