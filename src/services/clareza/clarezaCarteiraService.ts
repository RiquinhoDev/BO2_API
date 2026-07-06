import axios from 'axios'
import { cacheService } from '../cache.service'
import { fmpThrottle } from './fmpThrottle'
import { normalizeTicker, isValidTicker } from './tickerUtils'
import ClarezaCarteiraData from '../../models/ClarezaCarteiraData'

type CarteiraKind = 'stock' | 'fund' | 'crypto'
type CarteiraUniverseItem = { ticker: string; name: string; type: string; sector: string }
type CarteiraItem = CarteiraUniverseItem & { kind: CarteiraKind }

// Limits concurrency without adding p-queue to this hot path.
async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = []
  let index = 0
  async function worker() {
    while (index < tasks.length) {
      const i = index++
      results[i] = await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker))
  return results
}

const FMP_BASE = 'https://financialmodelingprep.com/stable'
export const CLAREZA_CARTEIRA_CACHE_KEY = 'clareza:carteira-data'
export const CLAREZA_CARTEIRA_CACHE_TTL = 28800 // 8 hours

export const STOCK_UNIVERSE: CarteiraUniverseItem[] = [
  {
    "ticker": "NVDA",
    "name": "Nvidia",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "AAPL",
    "name": "Apple",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "GOOGL",
    "name": "Alphabet",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "MSFT",
    "name": "Microsoft",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "AMZN",
    "name": "Amazon",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "AVGO",
    "name": "Broadcom",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "META",
    "name": "Meta",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "TSLA",
    "name": "Tesla",
    "type": "growth",
    "sector": "Consumer"
  },
  {
    "ticker": "AMD",
    "name": "AMD",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "NFLX",
    "name": "Netflix",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "PLTR",
    "name": "Palantir",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "CRM",
    "name": "Salesforce",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "ADBE",
    "name": "Adobe",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "ORCL",
    "name": "Oracle",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "LRCX",
    "name": "Lam Research",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "AMAT",
    "name": "Applied Materials",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "KLAC",
    "name": "KLA Corporation",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "ANET",
    "name": "Arista Networks",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "ISRG",
    "name": "Intuitive Surgical",
    "type": "growth",
    "sector": "Healthcare"
  },
  {
    "ticker": "NOW",
    "name": "ServiceNow",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "PANW",
    "name": "Palo Alto Networks",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "MRVL",
    "name": "Marvell Technology",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "MU",
    "name": "Micron Technology",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "UBER",
    "name": "Uber",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "LLY",
    "name": "Eli Lilly",
    "type": "growth",
    "sector": "Healthcare"
  },
  {
    "ticker": "COST",
    "name": "Costco",
    "type": "growth",
    "sector": "Consumer"
  },
  {
    "ticker": "TMUS",
    "name": "T-Mobile",
    "type": "growth",
    "sector": "Telecom"
  },
  {
    "ticker": "GEV",
    "name": "GE Vernova",
    "type": "growth",
    "sector": "Industrials"
  },
  {
    "ticker": "GE",
    "name": "GE Aerospace",
    "type": "growth",
    "sector": "Industrials"
  },
  {
    "ticker": "APP",
    "name": "AppLovin",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "CRWD",
    "name": "CrowdStrike",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "INTU",
    "name": "Intuit",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "ADSK",
    "name": "Autodesk",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "WDAY",
    "name": "Workday",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "DDOG",
    "name": "Datadog",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "TTD",
    "name": "The Trade Desk",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "VRTX",
    "name": "Vertex Pharmaceuticals",
    "type": "growth",
    "sector": "Healthcare"
  },
  {
    "ticker": "REGN",
    "name": "Regeneron",
    "type": "growth",
    "sector": "Healthcare"
  },
  {
    "ticker": "BSX",
    "name": "Boston Scientific",
    "type": "growth",
    "sector": "Healthcare"
  },
  {
    "ticker": "HCA",
    "name": "HCA Healthcare",
    "type": "growth",
    "sector": "Healthcare"
  },
  {
    "ticker": "SYK",
    "name": "Stryker",
    "type": "growth",
    "sector": "Healthcare"
  },
  {
    "ticker": "CEG",
    "name": "Constellation Energy",
    "type": "growth",
    "sector": "Utilities"
  },
  {
    "ticker": "DELL",
    "name": "Dell Technologies",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "APH",
    "name": "Amphenol",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "ADI",
    "name": "Analog Devices",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "QCOM",
    "name": "Qualcomm",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "SPGI",
    "name": "S&P Global",
    "type": "growth",
    "sector": "Finance"
  },
  {
    "ticker": "CME",
    "name": "CME Group",
    "type": "growth",
    "sector": "Finance"
  },
  {
    "ticker": "MCO",
    "name": "Moody's",
    "type": "growth",
    "sector": "Finance"
  },
  {
    "ticker": "BLK",
    "name": "BlackRock",
    "type": "growth",
    "sector": "Finance"
  },
  {
    "ticker": "BKNG",
    "name": "Booking Holdings",
    "type": "growth",
    "sector": "Consumer"
  },
  {
    "ticker": "SBUX",
    "name": "Starbucks",
    "type": "growth",
    "sector": "Consumer"
  },
  {
    "ticker": "NKE",
    "name": "Nike",
    "type": "growth",
    "sector": "Consumer"
  },
  {
    "ticker": "LULU",
    "name": "Lululemon",
    "type": "growth",
    "sector": "Consumer"
  },
  {
    "ticker": "ELV",
    "name": "Elevance Health",
    "type": "growth",
    "sector": "Healthcare"
  },
  {
    "ticker": "FICO",
    "name": "Fair Isaac (FICO)",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "HWM",
    "name": "Howmet Aerospace",
    "type": "growth",
    "sector": "Industrials"
  },
  {
    "ticker": "ZTS",
    "name": "Zoetis",
    "type": "growth",
    "sector": "Healthcare"
  },
  {
    "ticker": "VSAT",
    "name": "Viasat",
    "type": "growth",
    "sector": "Telecom"
  },
  {
    "ticker": "SNDK",
    "name": "SanDisk",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "STX",
    "name": "Seagate Technology",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "WDC",
    "name": "Western Digital",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "THEON.AS",
    "name": "Theon International",
    "type": "growth",
    "sector": "Industrials"
  },
  {
    "ticker": "CELH",
    "name": "Celsius Holdings",
    "type": "growth",
    "sector": "Consumer"
  },
  {
    "ticker": "COHR",
    "name": "Coherent",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "CRWV",
    "name": "CoreWeave",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "IREN",
    "name": "Iren",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "KLIC",
    "name": "Kulicke & Soffa",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "LITE",
    "name": "Lumentum",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "MP",
    "name": "MP Materials",
    "type": "growth",
    "sector": "Materials"
  },
  {
    "ticker": "NBIS",
    "name": "Nebius Group",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "ONDS",
    "name": "Ondas Holdings",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "HOOD",
    "name": "Robinhood",
    "type": "growth",
    "sector": "Finance"
  },
  {
    "ticker": "SOFI",
    "name": "SoFi Technologies",
    "type": "growth",
    "sector": "Finance"
  },
  {
    "ticker": "APLD",
    "name": "Applied Digital",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "BE",
    "name": "Bloom Energy",
    "type": "growth",
    "sector": "Energy"
  },
  {
    "ticker": "BRK-B",
    "name": "Berkshire Hathaway",
    "type": "value",
    "sector": "Finance"
  },
  {
    "ticker": "JPM",
    "name": "JPMorgan Chase",
    "type": "value",
    "sector": "Finance"
  },
  {
    "ticker": "BAC",
    "name": "Bank of America",
    "type": "value",
    "sector": "Finance"
  },
  {
    "ticker": "WFC",
    "name": "Wells Fargo",
    "type": "value",
    "sector": "Finance"
  },
  {
    "ticker": "GS",
    "name": "Goldman Sachs",
    "type": "value",
    "sector": "Finance"
  },
  {
    "ticker": "MS",
    "name": "Morgan Stanley",
    "type": "value",
    "sector": "Finance"
  },
  {
    "ticker": "C",
    "name": "Citigroup",
    "type": "value",
    "sector": "Finance"
  },
  {
    "ticker": "AXP",
    "name": "American Express",
    "type": "value",
    "sector": "Finance"
  },
  {
    "ticker": "SCHW",
    "name": "Charles Schwab",
    "type": "value",
    "sector": "Finance"
  },
  {
    "ticker": "COF",
    "name": "Capital One",
    "type": "value",
    "sector": "Finance"
  },
  {
    "ticker": "USB",
    "name": "US Bancorp",
    "type": "value",
    "sector": "Finance"
  },
  {
    "ticker": "PNC",
    "name": "PNC Financial",
    "type": "value",
    "sector": "Finance"
  },
  {
    "ticker": "CB",
    "name": "Chubb",
    "type": "value",
    "sector": "Finance"
  },
  {
    "ticker": "PGR",
    "name": "Progressive",
    "type": "value",
    "sector": "Finance"
  },
  {
    "ticker": "MET",
    "name": "MetLife",
    "type": "value",
    "sector": "Finance"
  },
  {
    "ticker": "AFL",
    "name": "Aflac",
    "type": "value",
    "sector": "Finance"
  },
  {
    "ticker": "V",
    "name": "Visa",
    "type": "value",
    "sector": "Finance"
  },
  {
    "ticker": "MA",
    "name": "Mastercard",
    "type": "value",
    "sector": "Finance"
  },
  {
    "ticker": "XOM",
    "name": "Exxon Mobil",
    "type": "value",
    "sector": "Energy"
  },
  {
    "ticker": "CVX",
    "name": "Chevron",
    "type": "value",
    "sector": "Energy"
  },
  {
    "ticker": "COP",
    "name": "ConocoPhillips",
    "type": "value",
    "sector": "Energy"
  },
  {
    "ticker": "EOG",
    "name": "EOG Resources",
    "type": "value",
    "sector": "Energy"
  },
  {
    "ticker": "SLB",
    "name": "SLB",
    "type": "value",
    "sector": "Energy"
  },
  {
    "ticker": "MPC",
    "name": "Marathon Petroleum",
    "type": "value",
    "sector": "Energy"
  },
  {
    "ticker": "OXY",
    "name": "Occidental Petroleum",
    "type": "value",
    "sector": "Energy"
  },
  {
    "ticker": "CAT",
    "name": "Caterpillar",
    "type": "value",
    "sector": "Industrials"
  },
  {
    "ticker": "RTX",
    "name": "RTX Corporation",
    "type": "value",
    "sector": "Industrials"
  },
  {
    "ticker": "HON",
    "name": "Honeywell",
    "type": "value",
    "sector": "Industrials"
  },
  {
    "ticker": "LMT",
    "name": "Lockheed Martin",
    "type": "value",
    "sector": "Industrials"
  },
  {
    "ticker": "NOC",
    "name": "Northrop Grumman",
    "type": "value",
    "sector": "Industrials"
  },
  {
    "ticker": "GD",
    "name": "General Dynamics",
    "type": "value",
    "sector": "Industrials"
  },
  {
    "ticker": "BA",
    "name": "Boeing",
    "type": "value",
    "sector": "Industrials"
  },
  {
    "ticker": "UPS",
    "name": "UPS",
    "type": "value",
    "sector": "Industrials"
  },
  {
    "ticker": "UNP",
    "name": "Union Pacific",
    "type": "value",
    "sector": "Industrials"
  },
  {
    "ticker": "DE",
    "name": "John Deere",
    "type": "value",
    "sector": "Industrials"
  },
  {
    "ticker": "ETN",
    "name": "Eaton Corporation",
    "type": "value",
    "sector": "Industrials"
  },
  {
    "ticker": "ITW",
    "name": "Illinois Tool Works",
    "type": "value",
    "sector": "Industrials"
  },
  {
    "ticker": "EMR",
    "name": "Emerson Electric",
    "type": "value",
    "sector": "Industrials"
  },
  {
    "ticker": "WM",
    "name": "Waste Management",
    "type": "value",
    "sector": "Industrials"
  },
  {
    "ticker": "IBM",
    "name": "IBM",
    "type": "value",
    "sector": "Technology"
  },
  {
    "ticker": "INTC",
    "name": "Intel",
    "type": "value",
    "sector": "Technology"
  },
  {
    "ticker": "CSCO",
    "name": "Cisco",
    "type": "value",
    "sector": "Technology"
  },
  {
    "ticker": "TXN",
    "name": "Texas Instruments",
    "type": "value",
    "sector": "Technology"
  },
  {
    "ticker": "ACN",
    "name": "Accenture",
    "type": "value",
    "sector": "Technology"
  },
  {
    "ticker": "WMT",
    "name": "Walmart",
    "type": "value",
    "sector": "Consumer"
  },
  {
    "ticker": "HD",
    "name": "Home Depot",
    "type": "value",
    "sector": "Consumer"
  },
  {
    "ticker": "LOW",
    "name": "Lowe's",
    "type": "value",
    "sector": "Consumer"
  },
  {
    "ticker": "MCD",
    "name": "McDonald's",
    "type": "value",
    "sector": "Consumer"
  },
  {
    "ticker": "DIS",
    "name": "Walt Disney",
    "type": "value",
    "sector": "Consumer"
  },
  {
    "ticker": "CMCSA",
    "name": "Comcast",
    "type": "value",
    "sector": "Consumer"
  },
  {
    "ticker": "TGT",
    "name": "Target",
    "type": "value",
    "sector": "Consumer"
  },
  {
    "ticker": "PG",
    "name": "Procter & Gamble",
    "type": "value",
    "sector": "Consumer"
  },
  {
    "ticker": "KO",
    "name": "Coca-Cola",
    "type": "value",
    "sector": "Consumer"
  },
  {
    "ticker": "PEP",
    "name": "PepsiCo",
    "type": "value",
    "sector": "Consumer"
  },
  {
    "ticker": "PM",
    "name": "Philip Morris",
    "type": "value",
    "sector": "Consumer"
  },
  {
    "ticker": "MO",
    "name": "Altria",
    "type": "value",
    "sector": "Consumer"
  },
  {
    "ticker": "CL",
    "name": "Colgate-Palmolive",
    "type": "value",
    "sector": "Consumer"
  },
  {
    "ticker": "KMB",
    "name": "Kimberly-Clark",
    "type": "value",
    "sector": "Consumer"
  },
  {
    "ticker": "GIS",
    "name": "General Mills",
    "type": "value",
    "sector": "Consumer"
  },
  {
    "ticker": "JNJ",
    "name": "Johnson & Johnson",
    "type": "value",
    "sector": "Healthcare"
  },
  {
    "ticker": "MRK",
    "name": "Merck",
    "type": "value",
    "sector": "Healthcare"
  },
  {
    "ticker": "ABT",
    "name": "Abbott Laboratories",
    "type": "value",
    "sector": "Healthcare"
  },
  {
    "ticker": "AMGN",
    "name": "Amgen",
    "type": "value",
    "sector": "Healthcare"
  },
  {
    "ticker": "TMO",
    "name": "Thermo Fisher",
    "type": "value",
    "sector": "Healthcare"
  },
  {
    "ticker": "DHR",
    "name": "Danaher",
    "type": "value",
    "sector": "Healthcare"
  },
  {
    "ticker": "UNH",
    "name": "UnitedHealth",
    "type": "value",
    "sector": "Healthcare"
  },
  {
    "ticker": "ABBV",
    "name": "AbbVie",
    "type": "value",
    "sector": "Healthcare"
  },
  {
    "ticker": "BMY",
    "name": "Bristol-Myers Squibb",
    "type": "value",
    "sector": "Healthcare"
  },
  {
    "ticker": "PFE",
    "name": "Pfizer",
    "type": "value",
    "sector": "Healthcare"
  },
  {
    "ticker": "GILD",
    "name": "Gilead Sciences",
    "type": "value",
    "sector": "Healthcare"
  },
  {
    "ticker": "MDT",
    "name": "Medtronic",
    "type": "value",
    "sector": "Healthcare"
  },
  {
    "ticker": "NOVO-B.CO",
    "name": "Novo Nordisk",
    "type": "value",
    "sector": "Healthcare"
  },
  {
    "ticker": "NEE",
    "name": "NextEra Energy",
    "type": "value",
    "sector": "Utilities"
  },
  {
    "ticker": "DUK",
    "name": "Duke Energy",
    "type": "value",
    "sector": "Utilities"
  },
  {
    "ticker": "SO",
    "name": "Southern Company",
    "type": "value",
    "sector": "Utilities"
  },
  {
    "ticker": "D",
    "name": "Dominion Energy",
    "type": "value",
    "sector": "Utilities"
  },
  {
    "ticker": "AEP",
    "name": "American Electric Power",
    "type": "value",
    "sector": "Utilities"
  },
  {
    "ticker": "EXC",
    "name": "Exelon",
    "type": "value",
    "sector": "Utilities"
  },
  {
    "ticker": "VZ",
    "name": "Verizon",
    "type": "value",
    "sector": "Telecom"
  },
  {
    "ticker": "T",
    "name": "AT&T",
    "type": "value",
    "sector": "Telecom"
  },
  {
    "ticker": "LIN",
    "name": "Linde",
    "type": "value",
    "sector": "Materials"
  },
  {
    "ticker": "SHW",
    "name": "Sherwin-Williams",
    "type": "value",
    "sector": "Materials"
  },
  {
    "ticker": "NEM",
    "name": "Newmont",
    "type": "value",
    "sector": "Materials"
  },
  {
    "ticker": "FCX",
    "name": "Freeport-McMoRan",
    "type": "value",
    "sector": "Materials"
  },
  {
    "ticker": "CNI",
    "name": "Canadian National Railway",
    "type": "value",
    "sector": "Industrials"
  },
  {
    "ticker": "VST",
    "name": "Vistra",
    "type": "value",
    "sector": "Utilities"
  },
  {
    "ticker": "O",
    "name": "Realty Income",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "VICI",
    "name": "VICI Properties",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "PLD",
    "name": "Prologis",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "LTC",
    "name": "LTC Properties",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "PSA",
    "name": "Public Storage",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "DLR",
    "name": "Digital Realty",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "EQIX",
    "name": "Equinix",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "AMT",
    "name": "American Tower",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "CCI",
    "name": "Crown Castle",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "SPG",
    "name": "Simon Property Group",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "AVB",
    "name": "AvalonBay Communities",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "EQR",
    "name": "Equity Residential",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "WPC",
    "name": "W. P. Carey",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "IRM",
    "name": "Iron Mountain",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "ARE",
    "name": "Alexandria Real Estate",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "WELL",
    "name": "Welltower",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "VTR",
    "name": "Ventas",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "NNN",
    "name": "NNN REIT",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "EXR",
    "name": "Extra Space Storage",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "ESS",
    "name": "Essex Property Trust",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "MAA",
    "name": "Mid-America Apartment",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "UDR",
    "name": "UDR Inc.",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "CPT",
    "name": "Camden Property Trust",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "KIM",
    "name": "Kimco Realty",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "REG",
    "name": "Regency Centers",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "FRT",
    "name": "Federal Realty",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "BXP",
    "name": "Boston Properties",
    "type": "reit",
    "sector": "REIT"
  },
  {
    "ticker": "2330.TW",
    "name": "TSMC",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "ASML.AS",
    "name": "ASML",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "NESN.SW",
    "name": "Nestl\u00e9",
    "type": "value",
    "sector": "Consumer"
  },
  {
    "ticker": "TCEHY",
    "name": "Tencent",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "BABA",
    "name": "Alibaba",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "SIE.DE",
    "name": "Siemens",
    "type": "value",
    "sector": "Industrials"
  },
  {
    "ticker": "MC.PA",
    "name": "LVMH",
    "type": "growth",
    "sector": "Consumer"
  },
  {
    "ticker": "ARM",
    "name": "Arm Holdings",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "005930.KS",
    "name": "Samsung Electronics",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "000660.KS",
    "name": "SK Hynix",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "SAB.MC",
    "name": "Banco Sabadell",
    "type": "value",
    "sector": "Finance"
  },
  {
    "ticker": "SAP.DE",
    "name": "SAP",
    "type": "growth",
    "sector": "Technology"
  },
  {
    "ticker": "RACE.MI",
    "name": "Ferrari",
    "type": "growth",
    "sector": "Consumer"
  },
  {
    "ticker": "SAF.PA",
    "name": "Safran",
    "type": "value",
    "sector": "Industrials"
  },
  {
    "ticker": "RHM.DE",
    "name": "Rheinmetall",
    "type": "value",
    "sector": "Industrials"
  },
  {
    "ticker": "DG.PA",
    "name": "Vinci",
    "type": "value",
    "sector": "Industrials"
  }
]

export const FUND_UNIVERSE: CarteiraUniverseItem[] = [
  {
    "ticker": "0GGH.L",
    "name": "iShares Core Global Aggregate Bond UCITS ETF EUR Hedged (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "0XC5.IL",
    "name": "BNP Paribas Easy S&P 500 UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "18M1.DE",
    "name": "Amundi Euro Government Bond 0-6 M UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "18MP.DE",
    "name": "Amundi MSCI World Ex EMU UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "2B70.DE",
    "name": "iShares Nasdaq US Biotechnology UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "2B76.DE",
    "name": "iShares Automation & Robotics UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "2B78.DE",
    "name": "iShares Healthcare Innovation UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "2B7J.DE",
    "name": "iShares MSCI World SRI UCITS ETF USD (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "2B7K.DE",
    "name": "iShares MSCI World SRI UCITS ETF EUR (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "2B7S.DE",
    "name": "iShares USD Treasury Bond 1-3yr UCITS ETF EUR Hedged (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "36BZ.DE",
    "name": "iShares MSCI China A UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "4BRZ.DE",
    "name": "iShares MSCI Brazil UCITS ETF (DE) USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "4COP.DE",
    "name": "Global X Copper Miners UCITS ETF USD Accumulating",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "4UBH.SG",
    "name": "UBS MSCI World Socially Responsible UCITS ETF USD acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "4UBQ.SG",
    "name": "UBS S&P 500 Scored & Screened UCITS ETF USD acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "500X.AS",
    "name": "State Street SPDR S&P 500 Leaders UCITS ETF USD Unhedged (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "5ESG.DE",
    "name": "Invesco S&P 500 Scored & Screened UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "5ESGE.MI",
    "name": "UBS S&P 500 Scored & Screened UCITS ETF hEUR acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "5MVW.DE",
    "name": "iShares MSCI World Energy Sector UCITS ETF USD (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "AASG.L",
    "name": "Amundi MSCI Emerging Markets Asia UCITS ETF USD",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "AASI.PA",
    "name": "Amundi MSCI Emerging Markets Asia UCITS ETF EUR (C)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ACWD.L",
    "name": "State Street SPDR MSCI All Country World UCITS ETF USD Unhedged (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ACWI.PA",
    "name": "Amundi MSCI All Country World UCITS ETF EUR Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "AEGE.MI",
    "name": "iShares Global Aggregate Bond ESG SRI UCITS ETF EUR Hedged (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "AEMD.DE",
    "name": "Amundi Core MSCI Emerging Markets UCITS ETF EUR Dist",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "AEME.L",
    "name": "Amundi Core MSCI Emerging Markets UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "AFRN.PA",
    "name": "Amundi Floating Rate Euro Corporate ESG UCITS ETF EUR (C)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "AGAP.L",
    "name": "WisdomTree Agriculture",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "AGBP.L",
    "name": "iShares Core Global Aggregate Bond UCITS ETF GBP Hedged (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "AGGG.L",
    "name": "iShares Core Global Aggregate Bond UCITS ETF USD (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "AGGU.L",
    "name": "iShares Core Global Aggregate Bond UCITS ETF USD Hedged (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "AIAG.L",
    "name": "L&G Artificial Intelligence UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "AIGI.L",
    "name": "WisdomTree Industrial Metals",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ALAT.PA",
    "name": "Amundi MSCI Emerging Markets Latin America UCITS ETF EUR (C)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "AME6.DE",
    "name": "Amundi STOXX Europe 600 ESG UCITS ETF DR EUR (C)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "AMED.DE",
    "name": "Amundi MSCI EMU ESG Selection UCITS ETF DR - EUR (C)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "AMEI.DE",
    "name": "Amundi MSCI Emerging Markets SRI Climate Paris Aligned UCITS ETF DR (C)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ASR3.DE",
    "name": "BNP Paribas Easy EUR Corporate Bond SRI PAB 1-3Y UCITS ETF Dist",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ASR5.DE",
    "name": "BNP Paribas Easy EUR Corporate Bond SRI PAB 3-5Y UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ASRI.DE",
    "name": "BNP Paribas Easy EUR Corporate Bond SRI PAB UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "AVGS.L",
    "name": "Avantis Global Small Cap Value UCITS ETF USD Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "AYE2.DE",
    "name": "iShares EUR High Yield Corporate Bond ESG SRI UCITS ETF EUR (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "AYEM.DE",
    "name": "iShares MSCI EM IMI Screened UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "AYEW.DE",
    "name": "iShares MSCI World Information Technology Sector Advanced UCITS ETF USD (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "BNK.PA",
    "name": "Amundi STOXX Europe 600 Banks UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "BNKE.L",
    "name": "Amundi Euro Stoxx Banks UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "BNKS.L",
    "name": "iShares S&P U.S. Banks UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "C001.DE",
    "name": "Amundi Core DAX UCITS ETF Dist",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "C50.PA",
    "name": "Amundi Core EURO STOXX 50 UCITS ETF EUR Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CAC.PA",
    "name": "Amundi CAC 40 UCITS ETF Dist",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CACC.PA",
    "name": "Amundi CAC 40 UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CB3G.DE",
    "name": "Amundi Euro Government tilted Green Bond UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CBE3.L",
    "name": "iShares Euro Government Bond 1-3yr UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CBU0.L",
    "name": "iShares USD Treasury Bond 7-10yr UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CBU7.L",
    "name": "iShares USD Treasury Bond 3-7yr UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CBUC.DE",
    "name": "iShares MSCI USA CTB Enhanced ESG UCITS ETF EUR Hedged (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CBUE.DE",
    "name": "iShares USD Treasury Bond 3-7yr UCITS ETF EUR Hedged (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CBUH.SG",
    "name": "iShares Edge MSCI World Momentum Factor UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CBUI.SG",
    "name": "iShares Edge MSCI World Value Factor UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CBUJ.DE",
    "name": "iShares EUR Corporate Bond ESG Paris-Aligned Climate UCITS ETF EUR (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CCAU.L",
    "name": "iShares MSCI Canada UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CD5.PA",
    "name": "Amundi Core EURO STOXX 50 UCITS ETF EUR Dist",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CE71.L",
    "name": "iShares Euro Government Bond 3-7yr UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CEMS.DE",
    "name": "iShares Edge MSCI Europe Value Factor UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CES1.L",
    "name": "iShares MSCI EMU Small Cap UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CEU1.L",
    "name": "iShares Core MSCI EMU UCITS ETF EUR (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CEU2.L",
    "name": "Amundi Core MSCI Europe UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CEUG.DE",
    "name": "Amundi MSCI Europe ESG Broad Transition UCITS ETF - EUR (C)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CG1G.DE",
    "name": "Amundi ETF DAX UCITS ETF DR",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CHIP.PA",
    "name": "Amundi MSCI Semiconductors UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CIND.L",
    "name": "iShares Dow Jones Industrial Average UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CJPU.L",
    "name": "iShares MSCI Japan UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CNDX.L",
    "name": "iShares Nasdaq 100 UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "COPA.L",
    "name": "WisdomTree Copper",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CORP.L",
    "name": "iShares Global Corporate Bond UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CPJ1.L",
    "name": "iShares Core MSCI Pacific ex Japan UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CRB.PA",
    "name": "Amundi Bloomberg Equal-weight Commodity ex-Agriculture UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CRPH.SW",
    "name": "iShares Global Corporate Bond EUR Hedged UCITS ETF (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CRPX.L",
    "name": "Amundi EUR Corporate Bond Climate Paris Aligned UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CSEMAS.SW",
    "name": "iShares MSCI EM Asia UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CSH2.L",
    "name": "Amundi Smart Overnight Return UCITS ETF GBP Hedged Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CSH2.PA",
    "name": "Amundi Smart Overnight Return UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CSHD.L",
    "name": "Amundi EUR Overnight Return UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CSP1.L",
    "name": "iShares Core S&P 500 UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CSUKX.SW",
    "name": "iShares Core FTSE 100 UCITS ETF GBP (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CSUSS.MI",
    "name": "iShares MSCI USA Small Cap ESG Enhanced CTB UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CSX5.L",
    "name": "iShares Core EURO STOXX 50 UCITS ETF EUR (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CSY1.DE",
    "name": "UBS MSCI USA NSL UCITS ETF USD acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CSY2.DE",
    "name": "UBS MSCI USA Selection UCITS ETF USD acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "CTEC.AS",
    "name": "iShares MSCI China Tech UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "D500.DE",
    "name": "Invesco S&P 500 UCITS ETF Dist",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "D5BG.DE",
    "name": "Xtrackers II EUR Corporate Bond UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "D6RP.F",
    "name": "Deka MSCI World Climate Change ESG UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "DAX.PA",
    "name": "Amundi DAX II UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "DAXXF",
    "name": "iShares Core DAX UCITS ETF (DE) EUR (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "DBXA.DE",
    "name": "Xtrackers MSCI Europe UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "DBXB.DE",
    "name": "Xtrackers II Eurozone Government Bond 7-10 UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "DBXD.DE",
    "name": "Xtrackers DAX UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "DBXE.DE",
    "name": "Xtrackers EURO STOXX 50 UCITS ETF 1D",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "DBXJ.DE",
    "name": "Xtrackers MSCI Japan UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "DBXN.DE",
    "name": "Xtrackers II Eurozone Government Bond UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "DBXP.DE",
    "name": "Xtrackers Eurozone Government Bond 1-3 UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "DBXR.DE",
    "name": "Xtrackers Eurozone Government Bond 5-7 UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "DBXS.DE",
    "name": "Xtrackers Swiss Large Cap UCITS ETF 1D",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "DFEN.DE",
    "name": "VanEck Defense UCITS ETF A",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "DH2O.L",
    "name": "iShares Global Water UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "DLTM.L",
    "name": "iShares MSCI EM Latin America UCITS ETF (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "DTLA.L",
    "name": "iShares USD Treasury Bond 20+yr UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "DTLE.L",
    "name": "iShares USD Treasury Bond 20+yr UCITS ETF EUR Hedged (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "DX2J.DE",
    "name": "Xtrackers MSCI Europe Small Cap UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "DX2X.DE",
    "name": "Xtrackers STOXX Europe 600 UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "DXET.DE",
    "name": "Xtrackers EURO STOXX 50 UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "E500.DE",
    "name": "Invesco S&P 500 EUR Hedged UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EBBB.PA",
    "name": "Amundi EUR Corporate Bond 1-5Y ESG UCITS ETF DR",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ECR3.DE",
    "name": "Amundi Index Euro Corporate SRI 0-3 Y UCITS ETF DR (C)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ECRP.L",
    "name": "Amundi Index Euro Corporate SRI UCITS ETF DR (C)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EDG2.L",
    "name": "iShares MSCI EM CTB Enhanced ESG UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EDM4.DE",
    "name": "iShares MSCI EMU CTB Enhanced ESG UCITS ETF EUR (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EDM6.DE",
    "name": "iShares MSCI Europe CTB Enhanced ESG UCITS ETF EUR (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EDMJ.DE",
    "name": "iShares MSCI Japan CTB Enhanced ESG UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EDMU.DE",
    "name": "iShares MSCI USA CTB Enhanced ESG UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EDMW.DE",
    "name": "iShares MSCI World CTB Enhanced ESG UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EEDG.L",
    "name": "iShares MSCI USA CTB Enhanced ESG UCITS ETF USD (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EEMK.PA",
    "name": "BNP Paribas Easy MSCI Emerging Min TE UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EEMU.PA",
    "name": "BNP Paribas Easy MSCI EMU Min TE UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EEUD.L",
    "name": "iShares MSCI Europe CTB Enhanced ESG UCITS ETF EUR (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EEUE.PA",
    "name": "BNP Paribas Easy MSCI Europe Min TE UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EEXF.L",
    "name": "iShares EUR Corporate Bond ex-Financials UCITS ETF EUR (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EGOV.PA",
    "name": "Amundi Core Euro Government Bond UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EGRI.PA",
    "name": "Amundi Index Euro Aggregate SRI UCITS ETF DR (C)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EIMU.L",
    "name": "iShares Core MSCI Emerging Markets IMI UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EJAP.DE",
    "name": "BNP Paribas Easy MSCI Japan Min TE UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EL42.DE",
    "name": "Deka MSCI Europe UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EL4A.DE",
    "name": "Deka DAX UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EL4B.DE",
    "name": "Deka EURO STOXX 50 UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EL4F.DE",
    "name": "Deka DAX (ausschuttend) UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ELFW.DE",
    "name": "Deka MSCI World UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EM13.MI",
    "name": "Amundi Euro Government Bond 1-3Y UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EMAD.L",
    "name": "State Street SPDR MSCI EM Asia UCITS ETF USD",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EMBE.L",
    "name": "iShares J.P. Morgan USD EM Bond EUR Hedged UCITS ETF (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EMCA.L",
    "name": "iShares J.P. Morgan USD Emerging Markets Corporate Bond UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EMCP.L",
    "name": "iShares J.P. Morgan USD Emerging Markets Corporate Bond UCITS ETF USD (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EMDD.L",
    "name": "State Street SPDR Bloomberg Emerging Markets Local Bond UCITS ETF USD Unhedged (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EMIM.L",
    "name": "iShares Core MSCI Emerging Markets IMI UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EMPA.AS",
    "name": "iShares MSCI EMU Paris-Aligned Climate UCITS ETF EUR (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EMRD.L",
    "name": "State Street SPDR MSCI Emerging Markets UCITS ETF USD",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EMSA.L",
    "name": "iShares J.P. Morgan Advanced USD EM Bond UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EMVL.L",
    "name": "iShares Edge MSCI EM Value Factor UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EMWE.DE",
    "name": "BNP Paribas Easy MSCI World SRI S-Series PAB 5% Capped UCITS ETF EUR Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EMXC.DE",
    "name": "Amundi MSCI Emerging Ex China UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EMXU.L",
    "name": "Amundi MSCI Emerging Ex China ESG Selection UCITS ETF DR (C)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EN4C.F",
    "name": "L&G Multi-Strategy Enhanced Commodities UCITS ETF USD Accumulating",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ENAM.PA",
    "name": "BNP Paribas Easy MSCI USA Min TE UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EPAB.L",
    "name": "Amundi S&P Eurozone Climate Paris Aligned UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EQAC.SW",
    "name": "Invesco EQQQ Nasdaq-100 UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EQQQ.DE",
    "name": "Invesco EQQQ Nasdaq-100 UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ERN1.L",
    "name": "iShares EUR Ultrashort Bond UCITS ETF EUR (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ERNA.L",
    "name": "iShares USD Ultrashort Bond UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ERNX.DE",
    "name": "iShares EUR Ultrashort Bond UCITS ETF EUR (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ESEE.DE",
    "name": "BNP Paribas Easy S&P 500 UCITS ETF EUR",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ESEH.DE",
    "name": "BNP Paribas Easy S&P 500 UCITS ETF EUR Hedged",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ESGE.PA",
    "name": "Amundi MSCI Europe ESG Selection UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ESGS.L",
    "name": "Invesco MSCI USA Universal Screened UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ESIF.DE",
    "name": "iShares MSCI Europe Financials Sector UCITS ETF EUR (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ESIH.DE",
    "name": "iShares MSCI Europe Health Care Sector UCITS ETF EUR (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ESIN.DE",
    "name": "iShares MSCI Europe Industrials Sector UCITS ETF EUR (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ESRG.L",
    "name": "Amundi MSCI Europe SRI Climate Paris Aligned UCITS ETF DR (C)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ETBB.PA",
    "name": "BNP Paribas Easy EURO STOXX 50 UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ETLN.DE",
    "name": "L&G Europe ex UK Equity UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ETSZ.DE",
    "name": "BNP Paribas Easy STOXX Europe 600 UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EUDI.L",
    "name": "State Street SPDR S&P Euro Dividend Aristocrats UCITS ETF EUR",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EUEA.AS",
    "name": "iShares Core EURO STOXX 50 UCITS ETF EUR (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EUN3.DE",
    "name": "iShares Global Government Bond UCITS ETF USD (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EUN4.DE",
    "name": "iShares EUR Aggregate Bond ESG SRI UCITS ETF EUR (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EUN5.DE",
    "name": "iShares Core EUR Corporate Bond UCITS ETF (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EUN6.DE",
    "name": "iShares EUR Government Bond 0-1yr UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EUNK.DE",
    "name": "iShares Core MSCI Europe UCITS ETF EUR (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EUNM.DE",
    "name": "iShares MSCI EM UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EUNN.DE",
    "name": "iShares Core MSCI Japan IMI UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EUNS.DE",
    "name": "iShares EUR Corporate Bond ex-Financials 1-5yr ESG SRI UCITS ETF EUR (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EUNT.DE",
    "name": "iShares EUR Corporate Bond 1-5yr UCITS ETF EUR (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EUNW.DE",
    "name": "iShares EUR High Yield Corporate Bond UCITS ETF EUR (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EUNX.DE",
    "name": "iShares US Aggregate Bond UCITS ETF (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EUNY.DE",
    "name": "iShares Emerging Markets Dividend UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EWSP.L",
    "name": "iShares S&P 500 Equal Weight UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EXCH.AS",
    "name": "iShares MSCI EM ex-China UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EXI2.DE",
    "name": "iShares Dow Jones Global Titans 50 UCITS ETF (DE) EUR (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EXIE.DE",
    "name": "iShares STOXX Europe 600 UCITS ETF (DE) EUR (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EXS3.DE",
    "name": "iShares MDAX UCITS ETF (DE)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EXSH.DE",
    "name": "iShares STOXX Europe Select Dividend 30 UCITS ETF (DE)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EXSI.DE",
    "name": "iShares EURO STOXX UCITS ETF (DE)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EXUS.DE",
    "name": "Xtrackers MSCI World ex USA UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EXV1.DE",
    "name": "iShares STOXX Europe 600 Banks UCITS ETF (DE)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EXVM.DE",
    "name": "iShares eb.rexx Government Germany 0-1yr UCITS ETF (DE)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EXW1.DE",
    "name": "iShares EURO STOXX 50 UCITS ETF (DE)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EXX1.DE",
    "name": "iShares EURO STOXX Banks 30-15 UCITS ETF (DE)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "EXXT.DE",
    "name": "iShares Nasdaq 100 UCITS ETF (DE)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "F500.DE",
    "name": "Amundi S&P 500 Screened UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "FCBR.L",
    "name": "First Trust Nasdaq Cybersecurity UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "FEMR.L",
    "name": "Fidelity Emerging Markets Equity Research Enhanced UCITS ETF ACC-USD",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "FLOA.L",
    "name": "iShares USD Floating Rate Bond UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "FLRK.L",
    "name": "Franklin FTSE Korea UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "FLXC.DE",
    "name": "Franklin FTSE China UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "FLXI.DE",
    "name": "Franklin FTSE India UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "FUSD.DE",
    "name": "Fidelity US Quality Income UCITS ETF INC-USD",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "FUSR.L",
    "name": "Fidelity US Equity Research Enhanced UCITS ETF ACC-USD",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "FWRA.L",
    "name": "Invesco FTSE All-World UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "G2X.DE",
    "name": "VanEck Gold Miners UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "G2XJ.DE",
    "name": "VanEck Junior Gold Miners UCITS",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "G500.L",
    "name": "Invesco S&P 500 UCITS ETF GBP Hedged Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "GBPG.L",
    "name": "Goldman Sachs Access UK Gilts 1-10 Years UCITS ETF Class GBP (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "GCVB.L",
    "name": "State Street SPDR FTSE Global Convertible Bond UCITS ETF USD Unhedged (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "GDIG.L",
    "name": "VanEck S&P Global Mining UCITS ETF A",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "GEDM.L",
    "name": "iShares MSCI EM IMI Screened UCITS ETF USD (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "GEMU.PA",
    "name": "BNP Paribas Easy JPM ESG EMU Government Bond IG 3-5Y UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "GILS.L",
    "name": "Amundi Core UK Government Bond UCITS ETF Dist",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "GIN.L",
    "name": "State Street SPDR Morningstar Multi-Asset Global Infrastructure UCITS ETF USD",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "GLAU.L",
    "name": "State Street SPDR Bloomberg Global Aggregate Bond UCITS ETF USD Hedged (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "GLDV.L",
    "name": "State Street SPDR S&P Global Dividend Aristocrats UCITS ETF USD",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "GLTY.L",
    "name": "State Street SPDR Bloomberg UK Gilt UCITS ETF GBP",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "GOAI.DE",
    "name": "Amundi MSCI Robotics & AI UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "GPSA.L",
    "name": "iShares MSCI USA Screened UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "GRID.F",
    "name": "First Trust Nasdaq Clean Edge Smart Grid Infrastructure UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "H410.DE",
    "name": "HSBC MSCI Emerging Markets UCITS ETF USD",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "H41J.DE",
    "name": "HSBC Multi-Factor Worldwide Equity UCITS ETF USD",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "H4ZA.DE",
    "name": "HSBC EURO STOXX 50 UCITS ETF EUR",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "H4ZB.DE",
    "name": "HSBC FTSE 100 UCITS ETF GBP",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "H4ZF.DE",
    "name": "HSBC S&P 500 UCITS ETF USD",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "H4ZF.SG",
    "name": "HSBC MSCI World UCITS ETF USD",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "H4ZL.DE",
    "name": "HSBC FTSE EPRA NAREIT Developed UCITS ETF USD",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "HIGH.L",
    "name": "iShares EUR High Yield Corporate Bond UCITS ETF EUR (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "HSTC.L",
    "name": "HSBC Hang Seng TECH UCITS ETF HKD",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "HYUS.L",
    "name": "iShares Broad USD High Yield Corporate Bond UCITS ETF USD (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IB01.L",
    "name": "iShares USD Treasury Bond 0-1yr UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IB28.MI",
    "name": "iShares iBonds Dec 2028 Term EUR Corporate UCITS ETF EUR (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IBB1.DE",
    "name": "iShares $ Treasury Bond 7-10yr UCITS ETF EUR Hedged (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IBCA.DE",
    "name": "iShares Euro Government Bond 1-3yr UCITS ETF (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IBCD.DE",
    "name": "iShares USD Corporate Bond UCITS ETF (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IBCF.DE",
    "name": "iShares S&P 500 EUR Hedged UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IBCG.DE",
    "name": "iShares MSCI Japan EUR Hedged UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IBCH.DE",
    "name": "iShares MSCI World EUR Hedged UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IBCI.DE",
    "name": "iShares Euro Inflation Linked Government Bond UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IBCK.DE",
    "name": "iShares Edge S&P 500 Minimum Volatility UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IBCN.DE",
    "name": "iShares Euro Government Bond 3-5yr UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IBCS.DE",
    "name": "iShares Euro Corporate Bond Large Cap UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IBGM.L",
    "name": "iShares Euro Government Bond 7-10yr UCITS ETF EUR (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IBTA.L",
    "name": "iShares USD Treasury Bond 1-3yr UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IBTM.L",
    "name": "iShares USD Treasury Bond 7-10yr UCITS ETF (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IBTS.L",
    "name": "iShares USD Treasury Bond 1-3yr UCITS ETF (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ICGA.DE",
    "name": "iShares MSCI China UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ICOV.L",
    "name": "iShares Euro Covered Bond UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IDEM.L",
    "name": "iShares MSCI EM UCITS ETF (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IDFF.L",
    "name": "iShares MSCI AC Far East ex-Japan UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IDIN.L",
    "name": "iShares Global Infrastructure UCITS ETF USD (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IDKO.L",
    "name": "iShares MSCI Korea UCITS ETF (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IDNA.L",
    "name": "iShares MSCI North America UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IDP6.L",
    "name": "iShares S&P SmallCap 600 UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IDTW.L",
    "name": "iShares MSCI Taiwan UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IDUS.L",
    "name": "iShares Core S&P 500 UCITS ETF USD (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IDVY.L",
    "name": "iShares Euro Dividend UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IDWP.L",
    "name": "iShares Developed Markets Property Yield UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IE000XZSV718.SG",
    "name": "State Street SPDR S&P 500 UCITS ETF USD Unhedged (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IE1A.DE",
    "name": "iShares EUR Corporate Bond 1-5yr UCITS ETF EUR (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IE3E.DE",
    "name": "iShares EUR Corporate Bond 0-3yr ESG SRI UCITS ETF EUR (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IEAA.L",
    "name": "iShares Core EUR Corporate Bond UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IEMB.L",
    "name": "iShares J.P. Morgan USD Emerging Markets Bond UCITS ETF (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IEML.L",
    "name": "iShares J.P. Morgan EM Local Government Bond UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IESE.SW",
    "name": "iShares MSCI Europe SRI UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IESU.L",
    "name": "iShares S&P 500 Energy Sector UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IEUX.L",
    "name": "iShares MSCI Europe ex-UK UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IGBSF",
    "name": "iShares MSCI Global Semiconductors UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IGLT.L",
    "name": "iShares Core UK Gilts UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IGSG.L",
    "name": "iShares Dow Jones Global Leaders Screened UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IHCU.L",
    "name": "iShares S&P 500 Health Care Sector UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IHYA.L",
    "name": "iShares USD High Yield Corporate Bond UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IIND.L",
    "name": "iShares MSCI India UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IITU.L",
    "name": "iShares S&P 500 Information Technology Sector UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IJPN.AS",
    "name": "iShares MSCI Japan UCITS ETF (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IMEU.L",
    "name": "iShares Core MSCI Europe UCITS ETF EUR (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IMID.L",
    "name": "State Street SPDR MSCI All Country World Investable Market UCITS ETF USD Unhedged (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "INRG.L",
    "name": "iShares Global Clean Energy Transition UCITS ETF USD (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "INTL.L",
    "name": "WisdomTree Artificial Intelligence UCITS ETF USD Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IQQD.DE",
    "name": "iShares UK Dividend UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IQSA.DE",
    "name": "Invesco Global Active ESG Equity UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IROB.DE",
    "name": "L&G ROBO Global Robotics and Automation UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IS0E.DE",
    "name": "iShares Gold Producers UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IS3J.DE",
    "name": "iShares USD Short Duration Corporate Bond UCITS ETF (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IS3Q.DE",
    "name": "iShares Edge MSCI World Quality Factor UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ISAC.L",
    "name": "iShares MSCI ACWI UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ISDW.L",
    "name": "iShares MSCI World Islamic UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ISFA.AS",
    "name": "iShares Core FTSE 100 UCITS ETF GBP (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ISLN.L",
    "name": "iShares Physical Silver ETC",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ISMCF",
    "name": "iShares MSCI USA UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ISPA.DE",
    "name": "iShares STOXX Global Select Dividend 100 UCITS ETF (DE)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ISPY.L",
    "name": "L&G Cyber Security UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "ITPS.L",
    "name": "iShares USD TIPS UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IU5C.DE",
    "name": "iShares S&P 500 Communication Sector UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IUAA.L",
    "name": "iShares US Aggregate Bond UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IUFS.L",
    "name": "iShares S&P 500 Financials Sector UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IUQA.L",
    "name": "iShares Edge MSCI USA Quality Factor UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IUSU.L",
    "name": "iShares S&P 500 Utilities Sector UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IUVF.L",
    "name": "iShares Edge MSCI USA Value Factor UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IVOA.MI",
    "name": "iShares iBonds Dec 2028 Term EUR Corporate UCITS ETF EUR (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IWDA.L",
    "name": "iShares Core MSCI World UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IWLE.DE",
    "name": "iShares Core MSCI World UCITS ETF EUR Hedged (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "IWRD.AS",
    "name": "iShares MSCI World UCITS ETF (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "JBEM.DE",
    "name": "BNP Paribas Easy JPM ESG EMU Government Bond IG UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "JEPQ.L",
    "name": "JPMorgan Nasdaq Equity Premium Income Active UCITS ETF USD (dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "JERE.L",
    "name": "JPMorgan Europe Research Enhanced Index Equity Active UCITS ETF EUR (acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "JGPI.DE",
    "name": "JPMorgan Global Equity Premium Income Active UCITS ETF USD (dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "JGRE.L",
    "name": "JPMorgan Global Research Enhanced Index Equity Active UCITS ETF USD (acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "JMRE.L",
    "name": "JPMorgan Global Emerging Markets Research Enhanced Index Equity Active UCITS ETF USD (acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "JPEA.L",
    "name": "iShares J.P. Morgan USD Emerging Markets Bond UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "JPJP.L",
    "name": "State Street SPDR MSCI Japan UCITS ETF JPY Unhedged",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "JRDG.L",
    "name": "JPMorgan Global Research Enhanced Index Equity Active UCITS ETF USD (dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "JREU.DE",
    "name": "JPMorgan US Research Enhanced Index Equity Active UCITS ETF USD (acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "JRUD.DE",
    "name": "JPMorgan US Research Enhanced Index Equity Active UCITS ETF USD (dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "JSET.L",
    "name": "JPMorgan EUR Ultra-Short Income Active UCITS ETF EUR (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "JUHE.DE",
    "name": "JPMorgan US Research Enhanced Index Equity Active UCITS ETF EUR Hedged (acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "KX1G.DE",
    "name": "Amundi Euro Lowest Rated IG Government Bond UCITS ETF EUR Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "L0CK.DE",
    "name": "iShares Digital Security UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "LCJD.L",
    "name": "Amundi Core MSCI Japan UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "LCUK.DE",
    "name": "Amundi UK Equity All Cap UCITS ETF Dist",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "LG9.SI",
    "name": "Xtrackers MSCI China UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "LGGL.L",
    "name": "L&G Global Equity UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "LGQG.DE",
    "name": "Amundi MSCI EMU ESG Broad Transition UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "LGUS.L",
    "name": "L&G US Equity UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "LQDA.L",
    "name": "iShares USD Corporate Bond UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "LWCR.DE",
    "name": "Amundi MSCI World ESG Broad Transition UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "LYM8.DE",
    "name": "Amundi MSCI Water UCITS ETF Dist",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "LYM9.DE",
    "name": "Amundi MSCI New Energy UCITS ETF Dist",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "LYP6.DE",
    "name": "Amundi Core Stoxx Europe 600 UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "LYPG.DE",
    "name": "Amundi MSCI World Information Technology UCITS ETF EUR Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "LYQ6.DE",
    "name": "Amundi Euro Government Bond 10-15Y UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "LYQ7.DE",
    "name": "Amundi Euro Government Inflation-Linked Bond UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "LYSX.DE",
    "name": "Amundi EURO STOXX 50 II UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "LYXD.DE",
    "name": "Amundi Euro Government Bond 7-10Y UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "LYYB.DE",
    "name": "Amundi MSCI USA ESG Broad Transition UCITS ETF Dist",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "MDBE.DE",
    "name": "UBS Sustainable Development Bank Bonds UCITS ETF hEUR acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "MINT.L",
    "name": "PIMCO US Dollar Short Maturity UCITS ETF Dist",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "MTB.PA",
    "name": "Amundi Euro Government Bond 3-5Y UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "MVOL.L",
    "name": "iShares Edge MSCI World Minimum Volatility UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "MWRD.MI",
    "name": "Amundi Core MSCI World UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "MXUD.L",
    "name": "Invesco MSCI USA UCITS ETF Dist",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "MXUS.L",
    "name": "Invesco MSCI USA UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "MXWO.L",
    "name": "Invesco MSCI World UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "NATO.MI",
    "name": "HANetf Future of Defence UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "NDUS.L",
    "name": "State Street SPDR MSCI Europe Industrials UCITS ETF EUR",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "NESG.L",
    "name": "Invesco Nasdaq-100 ESG UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "NQSE.DE",
    "name": "iShares Nasdaq 100 UCITS ETF EUR Hedged Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "NUCG.L",
    "name": "VanEck Uranium and Nuclear Technologies UCITS ETF A",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "OM3F.DE",
    "name": "iShares EUR Corporate Bond ESG SRI UCITS ETF (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "P500.DE",
    "name": "Invesco S&P 500 UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "PABU.PA",
    "name": "Amundi S&P 500 Climate Paris Aligned UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "PABW.DE",
    "name": "Amundi MSCI World Climate Paris Aligned UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "PHSP.L",
    "name": "WisdomTree Physical Silver",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "PJSR.DE",
    "name": "PIMCO Euro Short Maturity UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "PR1C.DE",
    "name": "Amundi Core EUR Corporate Bond UCITS ETF EUR Dist",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "PR1J.DE",
    "name": "Amundi Prime Japan UCITS ETF DR (D)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "PR1R.DE",
    "name": "Amundi Prime Euro Government Bond UCITS ETF Dist",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "QDVL.DE",
    "name": "iShares EUR Corporate Bond 0-3yr ESG SRI UCITS ETF EUR (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "QDVR.DE",
    "name": "iShares MSCI USA SRI UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "QDVS.DE",
    "name": "iShares MSCI EM SRI UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "QDVW.DE",
    "name": "iShares MSCI World Quality Dividend Advanced UCITS ETF USD (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "R2SC.L",
    "name": "State Street SPDR Russell 2000 U.S. Small Cap UCITS ETF USD",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "REMX.L",
    "name": "VanEck Rare Earth and Strategic Metals UCITS ETF A",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SADM.DE",
    "name": "Amundi MSCI Emerging Markets ESG Selection UCITS ETF DR (C)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SAEU.L",
    "name": "iShares MSCI Europe Screened UCITS ETF EUR (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SAJP.L",
    "name": "iShares MSCI Japan Screened UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SAUM.L",
    "name": "iShares MSCI EMU Screened UCITS ETF EUR (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SAWD.L",
    "name": "iShares MSCI World Screened UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SC0D.DE",
    "name": "Invesco EURO STOXX 50 UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SDHA.L",
    "name": "iShares USD Short Duration High Yield Corporate Bond UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SDIA.L",
    "name": "iShares USD Short Duration Corporate Bond UCITS ETF (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SDUSF",
    "name": "iShares MSCI USA Screened UCITS ETF USD (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SDWD.L",
    "name": "iShares MSCI World Screened UCITS ETF USD (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SEAC.DE",
    "name": "UBS MSCI World Socially Responsible UCITS ETF USD acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SECA.DE",
    "name": "iShares EUR Government Bond Climate UCITS ETF EUR (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SEGA.MI",
    "name": "iShares Core Euro Government Bond UCITS ETF (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SHYU.L",
    "name": "iShares USD High Yield Corporate Bond UCITS ETF USD (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SILV.L",
    "name": "Global X Silver Miners UCITS ETF USD Accumulating",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SLMG.DE",
    "name": "iShares J.P. Morgan Advanced USD EM Bond UCITS ETF EUR Hedged (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SLXX.L",
    "name": "iShares Core GBP Corporate Bond UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SMGB.L",
    "name": "VanEck Semiconductor UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SMTC.L",
    "name": "Amundi Smart Overnight Return UCITS ETF USD Hedged Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SPEQ.L",
    "name": "Invesco S&P 500 Equal Weight UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SPF1.DE",
    "name": "State Street SPDR FTSE Global Convertible Bond UCITS ETF EUR Hedged (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SPP1.DE",
    "name": "State Street SPDR MSCI All Country World UCITS ETF EUR Hedged (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SPPE.DE",
    "name": "State Street SPDR S&P 500 UCITS ETF EUR Hedged",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SPPW.DE",
    "name": "State Street SPDR MSCI World UCITS ETF USD Unhedged",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SPX5.L",
    "name": "State Street SPDR S&P 500 UCITS ETF USD Unhedged (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SPY4.DE",
    "name": "State Street SPDR S&P 400 U.S. Mid Cap UCITS ETF USD Unhedged (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SPYD.DE",
    "name": "State Street SPDR S&P U.S. Dividend Aristocrats UCITS ETF USD Unhedged (Dist)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SUA0.DE",
    "name": "iShares EUR Corporate Bond ESG SRI UCITS ETF EUR (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "SXLK.L",
    "name": "State Street SPDR S&P U.S. Technology Select Sector UCITS ETF USD",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "TDGB.L",
    "name": "VanEck Morningstar Developed Markets Dividend Leaders UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "TI5A.AS",
    "name": "iShares USD TIPS 0-5 UCITS ETF USD (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "TRDX.DE",
    "name": "Invesco US Treasury Bond 7-10 Year UCITS ETF Dist",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "TSGB.L",
    "name": "VanEck World Equal Weight Screened UCITS ETF A",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "UB02.L",
    "name": "UBS Core MSCI Japan UCITS ETF JPY dis",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "UB06.L",
    "name": "UBS Core MSCI EMU UCITS ETF EUR dis",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "UB12.L",
    "name": "UBS Core MSCI Europe UCITS ETF EUR dis",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "UB30.L",
    "name": "UBS Core MSCI EM UCITS ETF USD dis",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "UBU3.DE",
    "name": "UBS Core MSCI USA UCITS ETF USD dis",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "UBU7.DE",
    "name": "UBS Core MSCI World UCITS ETF USD dis",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "UC13.L",
    "name": "UBS Core S&P 500 UCITS ETF USD dis",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "UC14.L",
    "name": "UBS CMCI Composite SF UCITS ETF USD acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "UC44.L",
    "name": "UBS MSCI World Socially Responsible UCITS ETF USD dis",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "UC48.L",
    "name": "UBS MSCI AC Asia ex Japan SF UCITS ETF USD acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "UC55.L",
    "name": "UBS MSCI World UCITS ETF USD dis",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "UC79.L",
    "name": "UBS MSCI EM Socially Responsible UCITS ETF USD dis",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "UCAP.L",
    "name": "Ossiam Shiller Barclays CAPE US Sector Value TR UCITS ETF 1C (USD)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "UET5.DE",
    "name": "UBS EURO STOXX 50 ESG UCITS ETF EUR dis",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "UETW.DE",
    "name": "UBS Core MSCI World UCITS ETF USD acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "USAC.PA",
    "name": "Amundi MSCI USA ESG Broad Transition UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "USSC.L",
    "name": "State Street SPDR MSCI USA Small Cap Value Weighted UCITS ETF USD",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "V3AA.L",
    "name": "Vanguard ESG Global All Cap UCITS ETF (USD) Accumulating",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "V60A.DE",
    "name": "Vanguard LifeStrategy 60% Equity UCITS ETF Accumulating",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "V80A.DE",
    "name": "Vanguard LifeStrategy 80% Equity UCITS ETF (EUR) Accumulating",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VAGF.DE",
    "name": "Vanguard Global Aggregate Bond UCITS ETF EUR Hedged Accumulating",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VAPU.L",
    "name": "Vanguard FTSE Developed Asia Pacific ex Japan UCITS ETF (USD) Accumulating",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VAPX.L",
    "name": "Vanguard FTSE Developed Asia Pacific ex Japan UCITS ETF Distributing",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VCPA.L",
    "name": "Vanguard USD Corporate Bond UCITS ETF Accumulating",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VDCA.L",
    "name": "Vanguard USD Corporate 1-3 Year Bond UCITS ETF Accumulating",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VDEM.L",
    "name": "Vanguard FTSE Emerging Markets UCITS ETF (USD) Distributing",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VDNR.L",
    "name": "Vanguard FTSE North America UCITS ETF (USD) Distributing",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VDST.L",
    "name": "Vanguard U.S. Treasury 0-1 Year Bond UCITS ETF (USD) Accumulating",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VDTA.L",
    "name": "Vanguard USD Treasury Bond UCITS ETF Accumulating",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VECA.DE",
    "name": "Vanguard EUR Corporate Bond UCITS ETF Accumulating",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VECP.DE",
    "name": "Vanguard EUR Corporate Bond UCITS ETF (EUR) Distributing",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VERE.DE",
    "name": "Vanguard FTSE Developed Europe ex UK UCITS ETF (EUR) Accumulating",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VERX.AS",
    "name": "Vanguard FTSE Developed Europe ex UK UCITS ETF (EUR) Distributing",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VETA.L",
    "name": "Vanguard EUR Eurozone Government Bond UCITS ETF Accumulating",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VETY.L",
    "name": "Vanguard EUR Eurozone Government Bond UCITS ETF Distributing",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VEUA.L",
    "name": "Vanguard FTSE Developed Europe UCITS ETF (EUR) Accumulating",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VEUR.L",
    "name": "Vanguard FTSE Developed Europe UCITS ETF Distributing",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VFEA.DE",
    "name": "Vanguard FTSE Emerging Markets UCITS ETF (USD) Accumulating",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VGDDF",
    "name": "Vanguard FTSE Developed World UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VGVE.DE",
    "name": "Vanguard FTSE Developed World UCITS ETF Distributing",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VGWD.DE",
    "name": "Vanguard FTSE All-World High Dividend Yield UCITS ETF Distributing",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VGWE.DE",
    "name": "Vanguard FTSE All-World High Dividend Yield UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VGWL.DE",
    "name": "Vanguard FTSE All-World UCITS ETF (USD) Distributing",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VJPA.DE",
    "name": "Vanguard FTSE Japan UCITS ETF (USD) Accumulating",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VJPN.L",
    "name": "Vanguard FTSE Japan UCITS ETF (USD) Distributing",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VMID.DE",
    "name": "Vanguard FTSE 250 UCITS ETF Distributing",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VNGDF",
    "name": "Vanguard S&P 500 UCITS ETF (USD) Distributing",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VNRA.DE",
    "name": "Vanguard FTSE North America UCITS ETF (USD) Accumulating",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VUAA.DE",
    "name": "Vanguard S&P 500 UCITS ETF (USD) Accumulating",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VUKE.DE",
    "name": "Vanguard FTSE 100 UCITS ETF (GBP) Distributing",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VUKG.L",
    "name": "Vanguard FTSE 100 UCITS ETF (GBP) Accumulating",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "VWCE.DE",
    "name": "Vanguard FTSE All-World UCITS ETF (USD) Accumulating",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "WDEF.L",
    "name": "WisdomTree Europe Defence UCITS ETF EUR Unhedged Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "WLDS.L",
    "name": "iShares MSCI World Small Cap UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "WOSC.L",
    "name": "State Street SPDR MSCI World Small Cap UCITS ETF USD Unhedged (Acc)",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "WSRI.PA",
    "name": "Amundi MSCI World SRI Climate Paris Aligned UCITS ETF Acc",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "WTEC.L",
    "name": "State Street SPDR MSCI World Technology UCITS ETF USD",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "X03G.DE",
    "name": "Xtrackers II Germany Government Bond UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XAIX.DE",
    "name": "Xtrackers Artificial Intelligence & Big Data UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XB4F.DE",
    "name": "Xtrackers II EUR Corporate Bond SRI PAB UCITS ETF 1D",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XCAD.L",
    "name": "Xtrackers MSCI Canada Screened UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XD5E.L",
    "name": "Xtrackers MSCI EMU UCITS ETF 1D",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XD9U.DE",
    "name": "Xtrackers MSCI USA UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XDEB.L",
    "name": "Xtrackers MSCI World Minimum Volatility UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XDEE.DE",
    "name": "Xtrackers S&P 500 Equal Weight UCITS ETF 2C EUR Hedged",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XDEM.DE",
    "name": "Xtrackers MSCI World Momentum UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XDEQ.DE",
    "name": "Xtrackers MSCI World Quality UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XDEV.DE",
    "name": "Xtrackers MSCI World Value UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XDEW.DE",
    "name": "Xtrackers S&P 500 Equal Weight UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XDJP.DE",
    "name": "Xtrackers Nikkei 225 UCITS ETF 1D",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XDN0.DE",
    "name": "Xtrackers MSCI Nordic UCITS ETF 1D",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XDPU.L",
    "name": "Xtrackers S&P 500 UCITS ETF 4C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XDW0.DE",
    "name": "Xtrackers MSCI World Energy UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XDWD.DE",
    "name": "Xtrackers MSCI World UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XDWH.DE",
    "name": "Xtrackers MSCI World Health Care UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XDWI.DE",
    "name": "Xtrackers MSCI World Industrials UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XDWL.DE",
    "name": "Xtrackers MSCI World UCITS ETF 1D",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XDWT.DE",
    "name": "Xtrackers MSCI World Information Technology UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XESJ.L",
    "name": "Xtrackers MSCI Japan ESG UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XESU.L",
    "name": "Xtrackers MSCI USA ESG UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XESW.L",
    "name": "Xtrackers MSCI World ESG UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XHYA.DE",
    "name": "Xtrackers EUR High Yield Corporate Bond UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XHYG.DE",
    "name": "Xtrackers EUR High Yield Corporate Bond UCITS ETF 1D",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XLKS.L",
    "name": "Invesco US Technology Sector UCITS ETF",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XMAW.DE",
    "name": "Xtrackers MSCI AC World Screened UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XMME.DE",
    "name": "Xtrackers MSCI Emerging Markets UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XNAQ.L",
    "name": "Xtrackers Nasdaq 100 UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XRS2.DE",
    "name": "Xtrackers Russell 2000 UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XSTC.L",
    "name": "Xtrackers MSCI USA Information Technology UCITS ETF 1D",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XUTD.DE",
    "name": "Xtrackers II US Treasuries UCITS ETF 1D",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XUTE.DE",
    "name": "Xtrackers II US Treasuries UCITS ETF 2D - EUR Hedged",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XY4P.DE",
    "name": "Xtrackers iBoxx Sovereigns Eurozone Yield Plus UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XZEM.DE",
    "name": "Xtrackers MSCI Emerging Markets ESG UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XZEU.DE",
    "name": "Xtrackers MSCI Europe ESG UCITS ETF 1C",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "XZWE.MI",
    "name": "Xtrackers MSCI World ESG UCITS ETF 2C EUR Hedged",
    "type": "etf",
    "sector": "ETF"
  },
  {
    "ticker": "4GLD.DE",
    "name": "Xetra-Gold",
    "type": "ouro",
    "sector": "Ouro"
  },
  {
    "ticker": "EGLN.L",
    "name": "iShares Physical Gold ETC",
    "type": "ouro",
    "sector": "Ouro"
  },
  {
    "ticker": "ETCGLDRMAU.WA",
    "name": "HANetf The Royal Mint Responsibly Sourced Physical Gold ETC",
    "type": "ouro",
    "sector": "Ouro"
  },
  {
    "ticker": "EWG2.SG",
    "name": "EUWAX Gold II",
    "type": "ouro",
    "sector": "Ouro"
  },
  {
    "ticker": "GBS.L",
    "name": "Gold Bullion Securities",
    "type": "ouro",
    "sector": "Ouro"
  },
  {
    "ticker": "GBSE.MI",
    "name": "WisdomTree Physical Gold - EUR Daily Hedged",
    "type": "ouro",
    "sector": "Ouro"
  },
  {
    "ticker": "GLDA.L",
    "name": "Amundi Physical Gold ETC (C)",
    "type": "ouro",
    "sector": "Ouro"
  },
  {
    "ticker": "GLDW.L",
    "name": "WisdomTree Core Physical Gold",
    "type": "ouro",
    "sector": "Ouro"
  },
  {
    "ticker": "PHAU.AS",
    "name": "WisdomTree Physical Gold",
    "type": "ouro",
    "sector": "Ouro"
  },
  {
    "ticker": "SGBS.L",
    "name": "WisdomTree Physical Swiss Gold",
    "type": "ouro",
    "sector": "Ouro"
  },
  {
    "ticker": "SGLD.L",
    "name": "Invesco Physical Gold ETC",
    "type": "ouro",
    "sector": "Ouro"
  },
  {
    "ticker": "XAD1.MI",
    "name": "Xtrackers Physical Gold EUR Hedged ETC",
    "type": "ouro",
    "sector": "Ouro"
  },
  {
    "ticker": "XAD5.MI",
    "name": "Xtrackers Physical Gold ETC (EUR)",
    "type": "ouro",
    "sector": "Ouro"
  },
  {
    "ticker": "XGDU.DE",
    "name": "Xtrackers IE Physical Gold ETC Securities",
    "type": "ouro",
    "sector": "Ouro"
  },
  {
    "ticker": "BCHN.L",
    "name": "Invesco CoinShares Global Blockchain UCITS ETF Acc",
    "type": "cripto",
    "sector": "Cripto"
  },
  {
    "ticker": "BITC.SG",
    "name": "CoinShares Physical Bitcoin",
    "type": "cripto",
    "sector": "Cripto"
  },
  {
    "ticker": "BTCW.SW",
    "name": "WisdomTree Physical Bitcoin",
    "type": "cripto",
    "sector": "Cripto"
  }
]

export const CRYPTO_UNIVERSE: CarteiraUniverseItem[] = [
  {
    "ticker": "BTCUSD",
    "name": "Bitcoin",
    "type": "cripto",
    "sector": "Cripto"
  },
  {
    "ticker": "ETHUSD",
    "name": "Ethereum",
    "type": "cripto",
    "sector": "Cripto"
  },
  {
    "ticker": "BNBUSD",
    "name": "BNB",
    "type": "cripto",
    "sector": "Cripto"
  },
  {
    "ticker": "XRPUSD",
    "name": "XRP",
    "type": "cripto",
    "sector": "Cripto"
  },
  {
    "ticker": "SOLUSD",
    "name": "Solana",
    "type": "cripto",
    "sector": "Cripto"
  },
  {
    "ticker": "TRXUSD",
    "name": "TRON",
    "type": "cripto",
    "sector": "Cripto"
  },
  {
    "ticker": "DOGEUSD",
    "name": "Dogecoin",
    "type": "cripto",
    "sector": "Cripto"
  },
  {
    "ticker": "ADAUSD",
    "name": "Cardano",
    "type": "cripto",
    "sector": "Cripto"
  },
  {
    "ticker": "LINKUSD",
    "name": "Chainlink",
    "type": "cripto",
    "sector": "Cripto"
  },
  {
    "ticker": "XLMUSD",
    "name": "Stellar",
    "type": "cripto",
    "sector": "Cripto"
  },
  {
    "ticker": "ZECUSD",
    "name": "Zcash",
    "type": "cripto",
    "sector": "Cripto"
  },
  {
    "ticker": "XMRUSD",
    "name": "Monero",
    "type": "cripto",
    "sector": "Cripto"
  },
  {
    "ticker": "CROUSD",
    "name": "Cronos",
    "type": "cripto",
    "sector": "Cripto"
  },
  {
    "ticker": "FETUSD",
    "name": "Fetch.ai",
    "type": "cripto",
    "sector": "Cripto"
  },
  {
    "ticker": "RENDERUSD",
    "name": "Render",
    "type": "cripto",
    "sector": "Cripto"
  }
]

export const UNIVERSE: CarteiraItem[] = [
  ...STOCK_UNIVERSE.map((item) => ({ ...item, kind: 'stock' as const })),
  ...FUND_UNIVERSE.map((item) => ({ ...item, kind: 'fund' as const })),
  ...CRYPTO_UNIVERSE.map((item) => ({ ...item, kind: 'crypto' as const }))
]

async function fmpGet<T = any>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  try {
    await fmpThrottle()
    const { data } = await axios.get(`${FMP_BASE}${path}`, {
      params: { apikey: process.env.FMP_API_KEY, ...params },
      timeout: 15000
    })
    if (!data || (!Array.isArray(data) && (data as any)['Error Message'])) return null
    if (Array.isArray(data)) return (data[0] ?? null) as T
    return data as T
  } catch {
    return null
  }
}

function safe(val: any, mult = 1): number | null {
  if (val === null || val === undefined || isNaN(Number(val))) return null
  return Math.round(Number(val) * mult * 10000) / 10000
}

function round2(val: number): number {
  return Math.round(val * 100) / 100
}

function normalizeForFmp(rawTicker: string): string {
  const ticker = normalizeTicker(rawTicker)
  // tickerUtils is intentionally strict for user-facing stock endpoints. The
  // curated fund universe includes longer exchange symbols, so allow those here.
  if (!isValidTicker(ticker) && !/^[A-Z0-9][A-Z0-9.\-]{0,24}$/.test(ticker)) {
    throw new Error('Ticker invalido')
  }
  return ticker
}

function perfFromRange(range: any, price: any): number | null {
  if (!range || !price) return null
  const low52 = parseFloat(String(range).split('-')[0])
  return low52 > 0 ? round2(((Number(price) - low52) / low52) * 100) : null
}

export async function fetchStock(rawTicker: string, isReit: boolean) {
  const ticker = normalizeForFmp(rawTicker)
  const p = await fmpGet('/profile', { symbol: ticker })
  const r = await fmpGet('/ratios-ttm', { symbol: ticker })
  const m = await fmpGet('/key-metrics-ttm', { symbol: ticker })

  const price = p?.price ?? null
  const change = p?.changePercentage ?? null
  const perf12m = perfFromRange(p?.range, price)

  let pFfo: number | null = null
  let ffoYield: number | null = null
  let ffoPayoutRatio: number | null = null

  if (isReit) {
    const income = await fmpGet('/income-statement', { symbol: ticker, period: 'annual', limit: '1' })
    const cashFlow = await fmpGet('/cash-flow-statement', { symbol: ticker, period: 'annual', limit: '1' })

    const netIncome = income?.netIncome ?? null
    const da = income?.depreciationAndAmortization ?? cashFlow?.depreciationAndAmortization ?? null
    const shares = income?.weightedAverageShsOut ?? null
    const divsPaid = cashFlow?.netDividendsPaid != null ? Math.abs(cashFlow.netDividendsPaid) : null

    if (netIncome !== null && da !== null) {
      const ffo = netIncome + da
      if (shares && shares > 0 && price) {
        const ffoPs = ffo / shares
        if (ffoPs > 0) {
          pFfo = round2(price / ffoPs)
          ffoYield = round2((ffoPs / price) * 100)
        }
      }
      if (divsPaid !== null && ffo > 0) {
        ffoPayoutRatio = round2((divsPaid / ffo) * 100)
      }
    }
  }

  return {
    price,
    change,
    perf12m,
    pe: r?.priceToEarningsRatioTTM ?? null,
    peg: r?.forwardPriceToEarningsGrowthRatioTTM ?? r?.priceToEarningsGrowthRatioTTM ?? null,
    ps: r?.priceToSalesRatioTTM ?? null,
    pb: r?.priceToBookRatioTTM ?? null,
    evEbitda: m?.evToEBITDATTM ?? null,
    fcfYield: safe(m?.freeCashFlowYieldTTM, 100),
    roe: safe(m?.returnOnEquityTTM, 100),
    netMargin: safe(r?.netProfitMarginTTM, 100),
    grossMarginTTM: safe(r?.grossProfitMarginTTM, 100),
    dividendYield: safe(r?.dividendYieldTTM, 100),
    payoutRatio: safe(r?.dividendPayoutRatioTTM, 100),
    debtEquity: r?.debtToEquityRatioTTM ?? null,
    debtEbitda: m?.netDebtToEBITDATTM ?? null,
    revenueGrowth: null,
    perf3m: null,
    pFfo,
    ffoYield,
    ffoPayoutRatio,
    currency: p?.currency ?? null,
    exchange: p?.exchangeShortName ?? p?.exchange ?? null,
    updated: new Date().toISOString()
  }
}

export async function fetchEtf(rawTicker: string) {
  const ticker = normalizeForFmp(rawTicker)
  const p = await fmpGet('/profile', { symbol: ticker })
  const r = await fmpGet('/ratios-ttm', { symbol: ticker })
  const price = p?.price ?? null

  return {
    price,
    change: p?.changePercentage ?? null,
    perf12m: perfFromRange(p?.range, price),
    dividendYield: safe(r?.dividendYieldTTM, 100),
    currency: p?.currency ?? null,
    exchange: p?.exchangeShortName ?? p?.exchange ?? null,
    updated: new Date().toISOString()
  }
}

export async function fetchCrypto(rawTicker: string) {
  const ticker = normalizeForFmp(rawTicker)
  const q = await fmpGet('/quote', { symbol: ticker })
  const price = q?.price ?? null
  let perf12m: number | null = null
  if (q?.yearLow && price) {
    const low = Number(q.yearLow)
    if (low > 0) perf12m = round2(((price - low) / low) * 100)
  }

  return {
    price,
    change: q?.changePercentage ?? null,
    perf12m,
    dividendYield: null,
    currency: 'USD',
    exchange: 'Cripto',
    updated: new Date().toISOString()
  }
}

export async function fetchItem(item: CarteiraItem) {
  if (item.kind === 'crypto') return fetchCrypto(item.ticker)
  if (item.kind === 'fund') return fetchEtf(item.ticker)
  return fetchStock(item.ticker, item.type === 'reit')
}

export async function refreshClarezaCarteiraData(): Promise<{ total: number; errors: number }> {
  if (!process.env.FMP_API_KEY) {
    throw new Error('FMP_API_KEY nao configurada')
  }

  console.log(`[ClarezaCarteira] Iniciando refresh de ${UNIVERSE.length} ativos...`)
  let errors = 0

  const results = await runWithConcurrency(
    UNIVERSE.map(item => async () => {
      try {
        const data = await fetchItem(item)
        return {
          ticker: item.ticker,
          name: item.name,
          type: item.type,
          kind: item.kind,
          sector: item.sector,
          data
        }
      } catch (err: any) {
        errors++
        console.error(`[ClarezaCarteira] Erro em ${item.ticker}:`, err.message)
        return {
          ticker: item.ticker,
          name: item.name,
          type: item.type,
          kind: item.kind,
          sector: item.sector,
          data: null
        }
      }
    }),
    12
  )

  await cacheService.set(CLAREZA_CARTEIRA_CACHE_KEY, results, CLAREZA_CARTEIRA_CACHE_TTL)

  try {
    await ClarezaCarteiraData.create({
      fetchedAt: new Date(),
      itemCount: UNIVERSE.length - errors,
      errors,
      items: results
    })
    const all = await ClarezaCarteiraData.find({}, '_id fetchedAt').sort({ fetchedAt: -1 }).lean()
    if (all.length > 5) {
      const toDelete = all.slice(5).map((d: any) => d._id)
      await ClarezaCarteiraData.deleteMany({ _id: { $in: toDelete } })
    }
    console.log('[ClarezaCarteira] Snapshot guardado na BD')
  } catch (err: any) {
    console.error('[ClarezaCarteira] Erro ao guardar snapshot na BD:', err.message)
  }

  console.log(`[ClarezaCarteira] Refresh completo - ${UNIVERSE.length - errors} ok, ${errors} erros`)
  return { total: UNIVERSE.length, errors }
}

export async function getClarezaCarteiraData(): Promise<any[] | null> {
  const cached = await cacheService.get<any[]>(CLAREZA_CARTEIRA_CACHE_KEY)
  if (cached) return cached

  try {
    const latest = await ClarezaCarteiraData.findOne().sort({ fetchedAt: -1 }).lean()
    if (latest?.items?.length) {
      console.log(`[ClarezaCarteira] Cache Redis vazio - a servir snapshot da BD (${latest.fetchedAt})`)
      await cacheService.set(CLAREZA_CARTEIRA_CACHE_KEY, latest.items, CLAREZA_CARTEIRA_CACHE_TTL)
      return latest.items as any[]
    }
  } catch (err: any) {
    console.error('[ClarezaCarteira] Erro ao ler snapshot da BD:', err.message)
  }

  console.warn('[ClarezaCarteira] Sem cache Redis e sem snapshot MongoDB. Aguardar cron ClarezaRefresh.')
  return null
}

export async function searchCarteira(rawQuery: string): Promise<any> {
  const q = String(rawQuery || '').trim().toUpperCase()
  const cache = await getClarezaCarteiraData()
  const ranked = (cache ?? [])
    .map((item: any) => {
      const ticker = String(item?.ticker ?? '')
      const name = String(item?.name ?? '')
      const tickerUp = ticker.toUpperCase()
      const nameUp = name.toUpperCase()
      let rank: number | null = null

      if (q === '') rank = 3
      else if (tickerUp === q) rank = 0
      else if (tickerUp.startsWith(q)) rank = 1
      else if (nameUp.startsWith(q)) rank = 2
      else if (tickerUp.includes(q) || nameUp.includes(q)) rank = 3

      if (rank === null) return null
      return {
        rank,
        result: {
          ticker,
          name,
          type: item?.type ?? null,
          kind: item?.kind ?? null,
          currency: item?.data?.currency ?? null
        }
      }
    })
    .filter((entry: any): entry is { rank: number; result: any } => entry !== null)
    .sort((a: any, b: any) => a.rank - b.rank || a.result.ticker.localeCompare(b.result.ticker))
    .map((entry: any) => entry.result)

  return { query: q, count: ranked.length, results: ranked.slice(0, 25) }
}
