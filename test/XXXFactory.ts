import { Wallet, constants, BigNumber } from 'ethers'
import { expect } from "chai"
import { ethers, waffle } from 'hardhat'
import { XXXFactory } from '../typechain-types/contracts/XXXFactory'
import { XXXFund2 } from '../typechain-types/contracts/XXXFund2'
import { getCreate2Address } from './shared/utilities'

import { 
  WETH9_MAINNET,
  NULL_ADDRESS,
  V3_SWAP_ROUTER_ADDRESS,
  WETH_CHARGE_AMOUNT,
  DEPOSIT_AMOUNT,
  WITHDRAW_AMOUNT,
  MANAGER_FEE,
  WHITE_LIST_TOKENS,
} from "./shared/constants"


describe('XXXFactory', () => {

  describe('sender : manager', () => {

    let deployer: Wallet, manager: Wallet

    let FactoryContractAddress = ''
    let FundContractAddress = ''
    let NewFundAddress = ''

    let fundBytecode = ''

    before('get signer', async () => {
      [deployer, manager] = await (ethers as any).getSigners()
    })

    before('load fund bytecode', async () => {
      fundBytecode = (await ethers.getContractFactory('XXXFund2')).bytecode
    })

    before("Deploy XXXFactory Contract", async function () {
      const XXXFactory = await ethers.getContractFactory("XXXFactory")
      const Factory = await XXXFactory.connect(deployer).deploy()
      await Factory.deployed()
      FactoryContractAddress = Factory.address
    })

    before("Deploy XXXFund2 Contract", async function () {
      const XXXFund = await ethers.getContractFactory("XXXFund2")
      const Fund = await XXXFund.connect(deployer).deploy()
      await Fund.deployed()
      FundContractAddress = Fund.address
    })

    it("createFund()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      await FactoryContract.connect(manager).createFund(manager.address)
      const expectedFundAddress = getCreate2Address(FactoryContractAddress, manager.address, fundBytecode)
      const savedFundAddress = await FactoryContract.connect(manager).getFundByManager(manager.address)
      expect(savedFundAddress).to.equal(expectedFundAddress)
      NewFundAddress = expectedFundAddress
    })

    it("getSwapRouterAddress()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(manager).getSwapRouterAddress()).to.equal(V3_SWAP_ROUTER_ADDRESS)
    })

    it("getManagerFee()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(manager).getManagerFee()).to.equal(MANAGER_FEE)
    })

    it("isWhiteListToken()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(manager).isWhiteListToken(WHITE_LIST_TOKENS[0])).to.be.true
    })

    it("getWhiteListTokens()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(manager).getWhiteListTokens()).to.have.members(WHITE_LIST_TOKENS)
    })

    it("getFundByManager()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(manager).getFundByManager(manager.address)).to.equal(NewFundAddress)
    })

    it("isInvestorFundExist()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(manager).isInvestorFundExist(NewFundAddress,manager.address)).to.be.false
    })

    it("getInvestorFundList()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(manager).getInvestorFundList(manager.address)).to.be.empty
    })

    it("addInvestorFundList()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      await expect(FactoryContract.connect(manager).addInvestorFundList(NewFundAddress)).to.be.reverted
    })

  })


  describe('sender : investor', () => {
  
    let deployer: Wallet, manager: Wallet, investor: Wallet

    let FactoryContractAddress = ''
    let FundContractAddress = ''
    let NewFundAddress = ''

    let fundBytecode = ''

    before('get signer', async () => {
      [deployer, manager, investor] = await (ethers as any).getSigners()
    })
    before('load fund bytecode', async () => {
      fundBytecode = (await ethers.getContractFactory('XXXFund2')).bytecode
    })

    before("Deploy XXXFactory Contract", async function () {
      const XXXFactory = await ethers.getContractFactory("XXXFactory")
      const Factory = await XXXFactory.connect(deployer).deploy()
      await Factory.deployed()
      FactoryContractAddress = Factory.address
    })

    before("Deploy XXXFund2 Contract", async function () {
      const XXXFund = await ethers.getContractFactory("XXXFund2")
      const Fund = await XXXFund.connect(deployer).deploy()
      await Fund.deployed()
      FundContractAddress = Fund.address
    })

    it("createFund()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      await FactoryContract.connect(manager).createFund(manager.address)
      const expectedFundAddress = getCreate2Address(FactoryContractAddress, manager.address, fundBytecode)
      const savedFundAddress = await FactoryContract.connect(manager).getFundByManager(manager.address)
      expect(savedFundAddress).to.equal(expectedFundAddress)
      NewFundAddress = expectedFundAddress
    })

    it("getSwapRouterAddress()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(investor).getSwapRouterAddress()).to.equal(V3_SWAP_ROUTER_ADDRESS)
    })

    it("getManagerFee()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(investor).getManagerFee()).to.equal(MANAGER_FEE)
    })

    it("isWhiteListToken()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(investor).isWhiteListToken(WHITE_LIST_TOKENS[0])).to.be.true
    })

    it("getWhiteListTokens()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(investor).getWhiteListTokens()).to.have.members(WHITE_LIST_TOKENS)
    })

    it("getFundByManager() investor has no fund", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(investor).getFundByManager(investor.address)).to.equal(NULL_ADDRESS)
    })

    it("isInvestorFundExist()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(investor).isInvestorFundExist(NewFundAddress,investor.address)).to.be.false
    })

    //investor is different from not investor at addInvestorFundList(), isInvestorFundExist()

    it("getInvestorFundList()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(investor).getInvestorFundList(investor.address)).to.have.lengthOf(0)
    })

    it("not investor yet => isInvestorFundExist()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(investor).isInvestorFundExist(investor.address, NewFundAddress)).to.be.false
    })
    it("register investor => addInvestorFundList()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      FactoryContract.connect(investor).addInvestorFundList(NewFundAddress)
    })
    it("now check investor => isInvestorFundExist()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(investor).isInvestorFundExist(investor.address, NewFundAddress)).to.be.true
    })

    it("getInvestorFundList()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(investor).getInvestorFundList(investor.address)).to.have.lengthOf(1)
    })

    it("addInvestorFundList() must be fail : duplicate", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      await expect(FactoryContract.connect(investor).addInvestorFundList(NewFundAddress)).to.be.reverted
    })

  })

  describe('sender : not investor', () => {

    let deployer: Wallet, manager: Wallet, notInvestor: Wallet

    let FactoryContractAddress = ''
    let FundContractAddress = ''
    let NewFundAddress = ''

    let fundBytecode = ''

    before('get signer', async () => {
      [deployer, manager, notInvestor] = await (ethers as any).getSigners()
    })
    before('load fund bytecode', async () => {
      fundBytecode = (await ethers.getContractFactory('XXXFund2')).bytecode
    })

    before("Deploy XXXFactory Contract", async function () {
      const XXXFactory = await ethers.getContractFactory("XXXFactory")
      const Factory = await XXXFactory.connect(deployer).deploy()
      await Factory.deployed()
      FactoryContractAddress = Factory.address
    })

    before("Deploy XXXFund2 Contract", async function () {
      const XXXFund = await ethers.getContractFactory("XXXFund2")
      const Fund = await XXXFund.connect(deployer).deploy()
      await Fund.deployed()
      FundContractAddress = Fund.address
    })

    it("createFund()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      await FactoryContract.connect(manager).createFund(manager.address)
      const expectedFundAddress = getCreate2Address(FactoryContractAddress, manager.address, fundBytecode)
      const savedFundAddress = await FactoryContract.connect(manager).getFundByManager(manager.address)
      expect(savedFundAddress).to.equal(expectedFundAddress)
      NewFundAddress = expectedFundAddress
    })

    it("getSwapRouterAddress()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(notInvestor).getSwapRouterAddress()).to.equal(V3_SWAP_ROUTER_ADDRESS)
    })

    it("getManagerFee()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(notInvestor).getManagerFee()).to.equal(MANAGER_FEE)
    })

    it("isWhiteListToken()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(notInvestor).isWhiteListToken(WHITE_LIST_TOKENS[0])).to.be.true
    })

    it("getWhiteListTokens()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(notInvestor).getWhiteListTokens()).to.have.members(WHITE_LIST_TOKENS)
    })

    it("getFundByManager()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(notInvestor).getFundByManager(notInvestor.address)).to.equal(NULL_ADDRESS)
    })

    it("isInvestorFundExist()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(notInvestor).isInvestorFundExist(NewFundAddress,notInvestor.address)).to.be.false
    })

    it("getInvestorFundList()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(notInvestor).getInvestorFundList(notInvestor.address)).to.be.empty
    })

    it("addInvestorFundList()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      await FactoryContract.connect(notInvestor).addInvestorFundList(NewFundAddress)
    })
  })
})