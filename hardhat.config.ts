import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-waffle";
import "hardhat-deploy";
require("@nomicfoundation/hardhat-chai-matchers")
require('dotenv').config()

const API_URL_MAINNET = process.env.API_URL_MAINNET;
const API_URL_GOERLI = process.env.API_URL_GOERLI;
const API_URL_POLYGON_MAINNET = process.env.API_URL_POLYGON_MAINNET;

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

//============================================ check wallet nounce ==========================================

const { createAlchemyWeb3 } = require("@alch/alchemy-web3");
const { task } = require("hardhat/config");

task("account", "returns nonce and balance for specified address on multiple networks")
  .addParam("address")
  .setAction(async address => {
    const web3Mainnet = createAlchemyWeb3(`https://eth-mainnet.g.alchemy.com/v2/${API_URL_MAINNET}`);
    const web3Goerli = createAlchemyWeb3(`https://eth-goerli.g.alchemy.com/v2/${API_URL_GOERLI}`);
    const web3Polygon = createAlchemyWeb3(`https://polygon-mainnet.g.alchemy.com/v2/${API_URL_POLYGON_MAINNET}`);

    const networkIDArr = ["Ethereum Mainnet:", "Ethereum Goerli:", "Polygon :"]
    const providerArr = [web3Mainnet, web3Goerli, web3Polygon];
    const resultArr = [];
    
    for (let i = 0; i < providerArr.length; i++) {
      const nonce = await providerArr[i].eth.getTransactionCount(address.address, "latest");
      const balance = await providerArr[i].eth.getBalance(address.address)
      resultArr.push([networkIDArr[i], nonce, parseFloat(providerArr[i].utils.fromWei(balance, "ether")).toFixed(2) + "ETH"]);
    }
    resultArr.unshift(["  |NETWORK|   |NONCE|   |BALANCE|  "])
    console.log(resultArr);
  });

//===========================================================================================================

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.7.6",
        settings: {
          optimizer: {
              enabled: true,
              runs: 3000000,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      chainId: 31337,
      forking: {
        url: `https://eth-mainnet.g.alchemy.com/v2/${API_URL_MAINNET}`,
        //blockNumber: 14390000
      },
      //allowUnlimitedContractSize: true,
    },
    mainnet: {
      url: `https://eth-mainnet.g.alchemy.com/v2/${API_URL_MAINNET}`,
      accounts: [TEST_PRIVATE_KEY1]
    },
    goerli: {
      url: `https://eth-goerli.g.alchemy.com/v2/${API_URL_GOERLI}`,
      accounts: [TEST_PRIVATE_KEY1, TEST_PRIVATE_KEY2, TEST_PRIVATE_KEY3]
    },
    polygon: {
      url: `https://polygon-mainnet.g.alchemy.com/v2/${API_URL_POLYGON_MAINNET}`,
      accounts: [TEST_PRIVATE_KEY1, TEST_PRIVATE_KEY2, TEST_PRIVATE_KEY3]
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
