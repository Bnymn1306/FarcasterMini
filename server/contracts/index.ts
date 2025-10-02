import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BondingCurveTokenABI = JSON.parse(
  readFileSync(join(__dirname, 'BondingCurveToken.json'), 'utf-8')
);
const TokenFactoryABI = JSON.parse(
  readFileSync(join(__dirname, 'TokenFactory.json'), 'utf-8')
);

export const BONDING_CURVE_TOKEN_ABI = BondingCurveTokenABI.abi;
export const TOKEN_FACTORY_ABI = TokenFactoryABI.abi;

// Contract addresses (will be set after deployment)
export const FACTORY_CONTRACT_ADDRESS = process.env.FACTORY_CONTRACT_ADDRESS || "";
