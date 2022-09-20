import { expect } from "chai";
import { ethers, waffle } from 'hardhat';
import { XXXFactory } from '../typechain-types/contracts/XXXFactory';
import { XXXFund2 } from '../typechain-types/contracts/XXXFund2';
import { getCreate2Address } from './shared/utilities'
import { Wallet } from 'ethers'


const V3_SWAP_ROUTER_ADDRESS = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
const MANAGER_FEE = 1
const WHITE_LIST_TOKENS = [
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  '0xc778417E063141139Fce010982780140Aa0cD5Ab',
  '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
  '0xEAE906dC299ccd9Cd94584377d0F96Ce144c942f'
]


describe('XXXFund2 : manager', () => {
  let deployer: Wallet, manager: Wallet

  let FactoryContractAddress = '';
  let FundContractAddress = '';
  let NewFundAddress = '';

  let fundBytecode = '';

  before('get signer', async () => {
    ;[deployer, manager] = await (ethers as any).getSigners()
  })
  before('load fund bytecode', async () => {
    fundBytecode = (await ethers.getContractFactory('XXXFund2')).bytecode
  })

  it("Deploy XXXFactory Contract", async function () {
    const XXXFactory = await ethers.getContractFactory("XXXFactory")
    const Factory = await XXXFactory.connect(deployer).deploy()
    await Factory.deployed()
    FactoryContractAddress = Factory.address
  });

  it("Deploy XXXFund2 Contract", async function () {
    const XXXFund = await ethers.getContractFactory("XXXFund2")
    const Fund = await XXXFund.connect(deployer).deploy()
    await Fund.deployed()
    FundContractAddress = Fund.address
  });

  it("createFund()", async function () {
    const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    await FactoryContract.connect(manager).createFund(manager.address)
    const expectedFundAddress = getCreate2Address(FactoryContractAddress, manager.address, fundBytecode)
    const savedFundAddress = await FactoryContract.connect(manager).getFundByManager(manager.address)
    expect(savedFundAddress).to.equal(expectedFundAddress)
    NewFundAddress = expectedFundAddress
  });

  //TODO : start set deposit parameter

  // it("deposit()", async function () {
  //   const FundContract = await ethers.getContractAt("XXXFund2", FundContractAddress)
  //   expect(await FundContract.connect(manager).deposit()).to.equal(V3_SWAP_ROUTER_ADDRESS)
  // });

  // it("withdraw()", async function () {
  //   const FundContract = await ethers.getContractAt("XXXFund2", FundContractAddress)
  //   expect(await FundContract.connect(manager).withdraw()).to.equal(MANAGER_FEE)
  // });

  // it("swap()", async function () {
  //   const FundContract = await ethers.getContractAt("XXXFund2", FundContractAddress)
  //   expect(await FundContract.connect(manager).swap(WHITE_LIST_TOKENS[0])).to.equal(true)
  // });

  // it("getInvestorTokens()", async function () {
  //   const FundContract = await ethers.getContractAt("XXXFund2", FundContractAddress)
  //   expect(await FundContract.connect(manager).getInvestorTokens()).to.have.members(WHITE_LIST_TOKENS)
  // });
})

describe('XXXFund2 : investor', () => { 
  let deployer: Wallet, manager: Wallet, investor: Wallet

  let FactoryContractAddress = '';
  let FundContractAddress = '';
  let NewFundAddress = '';

  let fundBytecode = '';

  before('get signer', async () => {
    ;[deployer, manager, investor] = await (ethers as any).getSigners()
  })
  before('load fund bytecode', async () => {
    fundBytecode = (await ethers.getContractFactory('XXXFund2')).bytecode
  })

  it("Deploy XXXFactory Contract", async function () {
    const XXXFactory = await ethers.getContractFactory("XXXFactory")
    const Factory = await XXXFactory.connect(deployer).deploy()
    await Factory.deployed()
    FactoryContractAddress = Factory.address
  });

  it("Deploy XXXFund2 Contract", async function () {
    const XXXFund = await ethers.getContractFactory("XXXFund2")
    const Fund = await XXXFund.connect(deployer).deploy()
    await Fund.deployed()
    FundContractAddress = Fund.address
  });

  it("createFund()", async function () {
    const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    await FactoryContract.connect(manager).createFund(manager.address)
    const expectedFundAddress = getCreate2Address(FactoryContractAddress, manager.address, fundBytecode)
    const savedFundAddress = await FactoryContract.connect(manager).getFundByManager(manager.address)
    expect(savedFundAddress).to.equal(expectedFundAddress)
    NewFundAddress = expectedFundAddress
  });

  //TODO : start set deposit parameter

  // it("deposit()", async function () {
  //   const FundContract = await ethers.getContractAt("XXXFund2", FundContractAddress)
  //   expect(await FundContract.connect(investor).deposit()).to.equal(V3_SWAP_ROUTER_ADDRESS)
  // });

  // it("withdraw()", async function () {
  //   const FundContract = await ethers.getContractAt("XXXFund2", FundContractAddress)
  //   expect(await FundContract.connect(investor).withdraw()).to.equal(MANAGER_FEE)
  // });

  // it("swap()", async function () {
  //   const FundContract = await ethers.getContractAt("XXXFund2", FundContractAddress)
  //   expect(await FundContract.connect(investor).swap(WHITE_LIST_TOKENS[0])).to.equal(true)
  // });

  // it("getInvestorTokens()", async function () {
  //   const FundContract = await ethers.getContractAt("XXXFund2", FundContractAddress)
  //   expect(await FundContract.connect(investor).getInvestorTokens()).to.have.members(WHITE_LIST_TOKENS)
  // });
})

describe('XXXFund2 : not investor', () => { 
  let deployer: Wallet, manager: Wallet, notInvestor: Wallet

  let FactoryContractAddress = '';
  let FundContractAddress = '';
  let NewFundAddress = '';

  let fundBytecode = '';

  before('get signer', async () => {
    ;[deployer, manager, notInvestor] = await (ethers as any).getSigners()
  })
  before('load fund bytecode', async () => {
    fundBytecode = (await ethers.getContractFactory('XXXFund2')).bytecode
  })
})

describe('XXXFund2 : another manager', () => { 
  let deployer: Wallet, manager1: Wallet, manager2: Wallet

  let FactoryContractAddress = '';
  let FundContractAddress = '';
  let NewFundAddress = '';

  let fundBytecode = '';

  before('get signer', async () => {
    ;[deployer, manager1, manager2] = await (ethers as any).getSigners()
  })
  before('load fund bytecode', async () => {
    fundBytecode = (await ethers.getContractFactory('XXXFund2')).bytecode
  })
})

describe('XXXFund2 : deployer', () => { 
  let deployer: Wallet, manager: Wallet

  let FactoryContractAddress = '';
  let FundContractAddress = '';
  let NewFundAddress = '';

  let fundBytecode = '';

  before('get signer', async () => {
    ;[deployer, manager] = await (ethers as any).getSigners()
  })
  before('load fund bytecode', async () => {
    fundBytecode = (await ethers.getContractFactory('XXXFund2')).bytecode
  })
})

    // function deposit(address investor, address _token, uint256 _amount) external payable;
    // function withdraw(address _token, address to, uint256 _amount) external payable;
    // function swap(
    //     V3TradeParams[] calldata trades
    // ) external payable returns (uint256);

    // function getInvestorTokens(address investor) external returns (Token[] memory);