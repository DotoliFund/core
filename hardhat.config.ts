import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-waffle";
import "hardhat-deploy";
require("@nomicfoundation/hardhat-chai-matchers")
require('dotenv').config()

const INFURA_API_KEY = process.env.INFURA_API_KEY;

// Replace this private key with your Goerli account private key
// To export your private key from Metamask, open Metamask and
// go to Account Details > Export Private Key
// Beware: NEVER put real Ether into testing accounts
const TEST_PRIVATE_KEY1 = process.env.TEST_PRIVATE_KEY1;
if (typeof TEST_PRIVATE_KEY1 === 'undefined') {
  throw new Error(`TEST_PRIVATE_KEY1 must be a defined environment variable`);
}
const TEST_PRIVATE_KEY2 = process.env.TEST_PRIVATE_KEY2;
if (typeof TEST_PRIVATE_KEY2 === 'undefined') {
  throw new Error(`TEST_PRIVATE_KEY2 must be a defined environment variable`);
}
const TEST_PRIVATE_KEY3 = process.env.TEST_PRIVATE_KEY3;
if (typeof TEST_PRIVATE_KEY3 === 'undefined') {
  throw new Error(`TEST_PRIVATE_KEY3 must be a defined environment variable`);
}

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.7.6",
        settings: {
          optimizer: {
              enabled: true,
              runs: 20000,
          },
        },
      },
    ],
  },
  networks: {
    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
      accounts: [TEST_PRIVATE_KEY1]
    },
    goerli: {
      url: `https://goerli.infura.io/v3/${INFURA_API_KEY}`,
      accounts: [TEST_PRIVATE_KEY1, TEST_PRIVATE_KEY2, TEST_PRIVATE_KEY3]
    },
    hardhat: {
      chainId: 31337,
      forking: {
        url: `https://mainnet.infura.io/v3/${INFURA_API_KEY}`,
        //blockNumber: 14390000
      },
      //allowUnlimitedContractSize: true,
    },
  },
  namedAccounts: {
    test_account_1: {
      default: 0, // here this will by default take the first account as deployer
      1: 0, // similarly on mainnet it will take the first account as deployer. Note though that depending on how hardhat network are configured, the account 0 on one network can be different than on another
    },
    test_account_2: {
      default: 1, // here this will by default take the first account as deployer
      1: 1, // similarly on mainnet it will take the first account as deployer. Note though that depending on how hardhat network are configured, the account 0 on one network can be different than on another
    },
    test_account_3: {
      default: 2, // here this will by default take the first account as deployer
      1: 2, // similarly on mainnet it will take the first account as deployer. Note though that depending on how hardhat network are configured, the account 0 on one network can be different than on another
    }
  },
};

export default config;
