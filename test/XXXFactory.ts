import { Wallet } from 'ethers'
import { expect } from "chai";
import { ethers, waffle } from 'hardhat';
import { XXXFactory } from '../typechain-types/contracts/XXXFactory';
import { XXXFund2 } from '../typechain-types/contracts/XXXFund2';
import { getCreate2Address } from './shared/utilities'


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


describe('XXXFactory : manager', () => {

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
    //console.log("Factory address : ", Factory.address)

    // const factoryContract = await ethers.getContractAt("XXXFactory", Factory.address)
    // const TimeLockAddress = '0x6c406e2328117BD8ca63F83EAeD7696801f87472'
    // const transferTx = await factoryContract.setOwner(TimeLockAddress)
    // await transferTx.wait(1)
  });

  it("Deploy XXXFund2 Contract", async function () {
    const XXXFund = await ethers.getContractFactory("XXXFund2")
    const Fund = await XXXFund.connect(deployer).deploy()
    await Fund.deployed()
    FundContractAddress = Fund.address
    //console.log("Fund Contract address : ", Fund.address)

    // const factoryContract = await ethers.getContractAt("XXXFactory", Factory.address)
    // const TimeLockAddress = '0x6c406e2328117BD8ca63F83EAeD7696801f87472'
    // const transferTx = await factoryContract.setOwner(TimeLockAddress)
    // await transferTx.wait(1)
  });

  it("createFund()", async function () {
    const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    await FactoryContract.connect(manager).createFund(manager.address)
    const expectedFundAddress = getCreate2Address(FactoryContractAddress, manager.address, fundBytecode)
    const savedFundAddress = await FactoryContract.connect(manager).getFundByManager(manager.address)
    expect(savedFundAddress).to.equal(expectedFundAddress)
    NewFundAddress = expectedFundAddress
  });

  it("getSwapRouterAddress()", async function () {
    const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    expect(await FactoryContract.connect(manager).getSwapRouterAddress()).to.equal(V3_SWAP_ROUTER_ADDRESS)
  });

  it("getManagerFee()", async function () {
    const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    expect(await FactoryContract.connect(manager).getManagerFee()).to.equal(MANAGER_FEE)
  });

  it("isWhiteListToken()", async function () {
    const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    expect(await FactoryContract.connect(manager).isWhiteListToken(WHITE_LIST_TOKENS[0])).to.equal(true)
  });

  it("getWhiteListTokens()", async function () {
    const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    expect(await FactoryContract.connect(manager).getWhiteListTokens()).to.have.members(WHITE_LIST_TOKENS)
  });

  it("getFundByManager()", async function () {
    const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    expect(await FactoryContract.connect(manager).getFundByManager(manager.address)).to.equal(NewFundAddress)
  });

  it("isInvestorFundExist()", async function () {
    const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    expect(await FactoryContract.connect(manager).isInvestorFundExist(NewFundAddress,manager.address)).to.equal(false)
  });

  it("getInvestorFundList()", async function () {
    const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    expect(await FactoryContract.connect(manager).getInvestorFundList(manager.address)).to.be.empty
  });

  it("addInvestorFundList()", async function () {
    const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    await expect(FactoryContract.connect(manager).addInvestorFundList(NewFundAddress)).to.be.revertedWith('XXXFactory: Manager cannot add investor fund list')
  });
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

  it("getSwapRouterAddress()", async function () {
    const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    expect(await FactoryContract.connect(notInvestor).getSwapRouterAddress()).to.equal(V3_SWAP_ROUTER_ADDRESS)
  });

  it("getManagerFee()", async function () {
    const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    expect(await FactoryContract.connect(notInvestor).getManagerFee()).to.equal(MANAGER_FEE)
  });

  it("isWhiteListToken()", async function () {
    const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    expect(await FactoryContract.connect(notInvestor).isWhiteListToken(WHITE_LIST_TOKENS[0])).to.equal(true)
  });

  it("getWhiteListTokens()", async function () {
    const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    expect(await FactoryContract.connect(notInvestor).getWhiteListTokens()).to.have.members(WHITE_LIST_TOKENS)
  });

  it("getFundByManager()", async function () {
    const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    expect(await FactoryContract.connect(notInvestor).getFundByManager(notInvestor.address)).to.equal(NewFundAddress)
  });

  it("isInvestorFundExist()", async function () {
    const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    expect(await FactoryContract.connect(notInvestor).isInvestorFundExist(NewFundAddress,notInvestor.address)).to.equal(false)
  });

  it("getInvestorFundList()", async function () {
    const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    expect(await FactoryContract.connect(notInvestor).getInvestorFundList(notInvestor.address)).to.be.empty
  });

  it("addInvestorFundList()", async function () {
    const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    await expect(FactoryContract.connect(notInvestor).addInvestorFundList(NewFundAddress)).to.be.revertedWith('XXXFactory: Manager cannot add investor fund list')
  });

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



  //TODO : investor do invest 
  // todo : XXXFund2 deposit from investor







  // it("getSwapRouterAddress()", async function () {
  //   const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
  //   expect(await FactoryContract.connect(investor).getSwapRouterAddress()).to.equal(V3_SWAP_ROUTER_ADDRESS)
  // });

  // it("getManagerFee()", async function () {
  //   const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
  //   expect(await FactoryContract.connect(investor).getManagerFee()).to.equal(MANAGER_FEE)
  // });

  // it("isWhiteListToken()", async function () {
  //   const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
  //   expect(await FactoryContract.connect(investor).isWhiteListToken(WHITE_LIST_TOKENS[0])).to.equal(true)
  // });

  // it("getWhiteListTokens()", async function () {
  //   const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
  //   expect(await FactoryContract.connect(investor).getWhiteListTokens()).to.have.members(WHITE_LIST_TOKENS)
  // });

  // it("getFundByManager()", async function () {
  //   const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
  //   expect(await FactoryContract.connect(investor).getFundByManager(investor.address)).to.equal(NewFundAddress)
  // });

  // it("isInvestorFundExist()", async function () {
  //   const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
  //   expect(await FactoryContract.connect(investor).isInvestorFundExist(NewFundAddress,investor.address)).to.equal(false)
  // });

  // it("getInvestorFundList()", async function () {
  //   const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
  //   expect(await FactoryContract.connect(investor).getInvestorFundList(investor.address)).to.be.empty
  // });

  // it("addInvestorFundList()", async function () {
  //   const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
  //   await expect(FactoryContract.connect(investor).addInvestorFundList(NewFundAddress)).to.be.revertedWith('XXXFactory: Manager cannot add investor fund list')
  // });
})

// interface IXXXFactory {

//     function owner() external view returns (address);

//     function createFund(address manager) external returns (address fund);

//     function setOwner(address _owner) external;

//     function getSwapRouterAddress() external view returns (address);
//     function setSwapRouterAddress(address _swapRouterAddress) external;

//     function getManagerFee() external view returns (uint256);
//     function setManagerFee(uint256 _managerFee) external;

//     function isWhiteListToken(address _token) external view returns (bool);
//     function getWhiteListTokens() external view returns (address[] memory);
//     function addWhiteListToken(address _token) external;
//     function removeWhiteListToken(address _token) external;

//     function getFundByManager(address manager) external view returns (address);
    
//     function isInvestorFundExist(address investor, address fund) external view returns (bool);
//     function getInvestorFundList(address investor) external view returns (address[] memory);
//     function addInvestorFundList(address fund) external;

// }