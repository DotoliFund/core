import { Wallet, constants, BigNumber, Contract } from 'ethers'
import { expect } from "chai"
import { ethers, waffle } from 'hardhat'
import { DotoliSetting } from '../typechain-types/contracts/DotoliSetting'
import { DotoliInfo } from '../typechain-types/contracts/DotoliInfo'
import { DotoliFund } from '../typechain-types/contracts/DotoliFund'

import { 
  NULL_ADDRESS,
  DOTOLI,
  WETH9,
  USDC,
  UNI,
  DAI,
  V3_SWAP_ROUTER_ADDRESS,
  UNISWAP_V3_FACTORY,
  NonfungiblePositionManager,
  MANAGER_FEE,
  WHITE_LIST_TOKENS,
} from "./shared/constants"


describe('Info', () => {

  let deployer: Wallet 
  let manager1: Wallet
  let manager2: Wallet
  let investor: Wallet
  let investor2: Wallet
  let noInvestor: Wallet

  let settingAddress: string
  let infoAddress: string
  let fundAddress: string

  let setting: Contract
  let info: Contract
  let fund: Contract

  let fundId1: string
  let fundId2: string
  
  before('get signer', async () => {
    [ deployer, 
      manager1, 
      manager2, 
      investor, 
      investor2,
      noInvestor
    ] = await (ethers as any).getSigners()
  })

  before("Deploy DotoliSetting Contract", async function () {
    const DotoliSetting = await ethers.getContractFactory("DotoliSetting")
    const Setting = await DotoliSetting.connect(deployer).deploy(DOTOLI, WETH9)
    await Setting.deployed()
    settingAddress = Setting.address
    setting = await ethers.getContractAt("DotoliSetting", settingAddress)
  })

  before("Deploy DotoliInfo Contract", async function () {
    const DotoliInfo = await ethers.getContractFactory("DotoliInfo")
    const Info = await DotoliInfo.connect(deployer).deploy()
    await Info.deployed()
    infoAddress = Info.address
    info = await ethers.getContractAt("DotoliInfo", infoAddress)
  })

  before("Deploy DotoliFund Contract", async function () {
    const DotoliFund = await ethers.getContractFactory("DotoliFund")
    const Fund = await DotoliFund.connect(deployer).deploy(WETH9, settingAddress, infoAddress)
    await Fund.deployed()
    fundAddress = Fund.address
    fund = await ethers.getContractAt("DotoliFund", fundAddress)
  })

  before("Set Owner DotoliInfo Contract", async function () {
    await info.connect(deployer).setOwner(fundAddress)
  })

  it("check DotoliInfo's owner is DotoliFund", async function () {
    const owner = await info.connect(manager1).owner()
    expect(owner).to.equal(fundAddress)
  })

  it("create 1st fund", async function () {
    await info.connect(manager1).createFund()
    const savedFundId = await info.connect(manager1).managingFund(manager1.address)
    expect(savedFundId).to.equal(BigNumber.from(1))
    fundId1 = savedFundId

    const fundIdCount = await info.connect(manager1).fundIdCount()
    expect(fundIdCount).to.equal(BigNumber.from(1))
  })

  it("create 2nd fund", async function () {
    await info.connect(manager2).createFund()
    const savedFundId = await info.connect(manager2).managingFund(manager2.address)
    expect(savedFundId).to.equal(BigNumber.from(2))
    fundId2 = savedFundId

    const fundIdCount = await info.connect(manager1).fundIdCount()
    expect(fundIdCount).to.equal(BigNumber.from(2))
  })

  describe('Deposit / Withdraw', () => {

    it("set UNI to white list token", async function () {
      await expect(setting.connect(deployer).setWhiteListToken(UNI))
    })

    it("check manager is subscribed to fund1", async function () {
      expect(await info.connect(manager1).isSubscribed(manager1.address, fundId1)).to.be.true
    })

    it("convert ETH to WETH", async function () {
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)
      await weth9.connect(manager1).deposit({
        from: manager1.address,
        value: WETH_CHARGE_AMOUNT
      })
      const manager1After = await getInvestorAccount(fundId1, manager1.address)
      expect(manager1After.WETH9).to.equal(manager1Before.WETH9.add(WETH_CHARGE_AMOUNT))
    })

    it("deposit ETH to fund1", async function () {
      const fund1Before = await getFundAccount(fundId1, notInvestor)

      await manager1.sendTransaction({
        to: fundAddress,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
        data: BigNumber.from(fundId1)
      })

      const manager1After = await getInvestorAccount(fundId1, manager1.address)
      const fund1After = await getFundAccount(fundId1, notInvestor)
      expect(manager1After.fundWETH).to.equal(DEPOSIT_AMOUNT)
      expect(manager1After.feeTokens).to.be.empty
      expect(fund1After.WETH9).to.equal(fund1Before.WETH9.add(DEPOSIT_AMOUNT))
    })

    it("withdraw ETH", async function () {
      const fund1Before = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)
      await fund.connect(manager1).withdraw(fundId1, WETH9, WITHDRAW_AMOUNT)
      const fund1After = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)
      expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH.sub(WITHDRAW_AMOUNT))
      expect(manager1After.feeTokens).to.be.empty
      expect(fund1After.WETH9).to.equal(fund1Before.WETH9.sub(WITHDRAW_AMOUNT))
    })

    it("deposit WETH", async function () {
      const fund1Before = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      await weth9.connect(manager1).approve(fundAddress, constants.MaxUint256)
      await fund.connect(manager1).deposit(fundId1, WETH9, DEPOSIT_AMOUNT)

      const fund1After = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)

      expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH.add(DEPOSIT_AMOUNT))
      expect(manager1After.feeTokens).to.be.empty
      expect(fund1After.WETH9).to.equal(fund1Before.WETH9.add(DEPOSIT_AMOUNT))
    })

    it("withdraw WETH", async function () {
      const fund1Before = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      await fund.connect(manager1).withdraw(fundId1, WETH9, WITHDRAW_AMOUNT)

      const fund1After = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)

      expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH.sub(WITHDRAW_AMOUNT))
      expect(manager1After.feeTokens).to.be.empty
      expect(fund1After.WETH9).to.equal(fund1Before.WETH9.sub(WITHDRAW_AMOUNT))
    })
  })

  describe('Swap', () => {

    it("#exactInputSingle WETH -> UNI", async function () {
      const swapInputAmount = BigNumber.from(1000000)
      const amountOutMinimum = BigNumber.from(1)

      const fund1Before = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      const params = exactInputSingleParams(
        WETH9,
        UNI,
        swapInputAmount,
        amountOutMinimum,
        BigNumber.from(0)
      )
      await fund.connect(manager1).swap(fundId1, manager1.address, params, { value: 0 })
      const fund1After = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)

      expect(fund1After.WETH9).to.equal(fund1Before.WETH9.sub(swapInputAmount))
      expect(fund1After.UNI).to.be.above(fund1Before.UNI)
      expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH.sub(swapInputAmount))
      expect(manager1After.fundUNI).to.be.above(manager1Before.fundUNI)
    })

    it("#exactInputSingle UNI -> WETH", async function () {
      const swapInputAmount = BigNumber.from(10000000)
      const amountOutMinimum = BigNumber.from(1)

      const fund1Before = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      const params = exactInputSingleParams(
        UNI,
        WETH9, 
        swapInputAmount, 
        amountOutMinimum, 
        BigNumber.from(0)
      )
      await fund.connect(manager1).swap(fundId1, manager1.address, params, { value: 0 })

      const fund1After = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)

      expect(fund1After.WETH9).to.be.above(fund1Before.WETH9)
      expect(fund1After.UNI).to.equal(fund1Before.UNI.sub(swapInputAmount))
      expect(manager1After.fundWETH).to.be.above(manager1Before.fundWETH)
      expect(manager1After.fundUNI).to.equal(manager1Before.fundUNI.sub(swapInputAmount))
    })
  })

  describe("#exactOutputSingle", async function () {

    it("WETH -> UNI", async function () {
      const swapOutputAmount = BigNumber.from(10000000)
      const amountInMaximum = BigNumber.from(10000000)

      const fund1Before = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      const params = exactOutputSingleParams(
        WETH9, 
        UNI, 
        swapOutputAmount, 
        amountInMaximum, 
        BigNumber.from(0)
      )
      await fund.connect(manager1).swap(fundId1, manager1.address, params, { value: 0 })

      const fund1After = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)

      expect(fund1After.WETH9).to.be.below(fund1Before.WETH9)
      expect(fund1After.UNI).to.equal(fund1Before.UNI.add(swapOutputAmount))
      expect(manager1After.fundWETH).to.be.below(manager1Before.fundWETH)
      expect(manager1After.fundUNI).to.equal(manager1Before.fundUNI.add(swapOutputAmount))

      //revert if fundId / investor is invalid
      await expect(fund.connect(manager1).swap(
        fundId2,
        manager1.address,
        params, 
        { value: 0 }
      )).to.be.reverted
      await expect(fund.connect(manager2).swap(
        fundId1,
        manager1.address,
        params, 
        { value: 0 }
      )).to.be.reverted
      await expect(fund.connect(notInvestor).swap(
        fundId1,
        notInvestor.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })

    it("UNI -> WETH", async function () {
      const swapOutputAmount = BigNumber.from(1000)
      const amountInMaximum = BigNumber.from(300000)

      const fund1Before = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      const params = exactOutputSingleParams(
        UNI,
        WETH9, 
        swapOutputAmount, 
        amountInMaximum, 
        BigNumber.from(0)
      )
      await fund.connect(manager1).swap(fundId1, manager1.address, params, { value: 0 })

      const fund1After = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)

      expect(fund1After.WETH9).to.equal(fund1Before.WETH9.add(swapOutputAmount))
      expect(fund1After.UNI).to.be.below(fund1Before.UNI)
      expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH.add(swapOutputAmount))
      expect(manager1After.fundUNI).to.be.below(manager1Before.fundUNI)

      //revert if fundId / investor is invalid
      await expect(fund.connect(manager1).swap(
        fundId2,
        manager1.address,
        params, 
        { value: 0 }
      )).to.be.reverted
      await expect(fund.connect(manager2).swap(
        fundId1,
        manager1.address,
        params, 
        { value: 0 }
      )).to.be.reverted
      await expect(fund.connect(notInvestor).swap(
        fundId1,
        notInvestor.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })
  })

  describe("#exactInput", async function () {

    it("WETH -> DAI -> UNI", async function () {
      const tokens = [WETH9, DAI, UNI]
      const swapInputAmount = BigNumber.from(1000000)
      const amountOutMinimum = BigNumber.from(1)

      const fund1Before = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      const params = exactInputParams(
        tokens,
        swapInputAmount,
        amountOutMinimum
      )
      await fund.connect(manager1).swap(fundId1, manager1.address, params, { value: 0 })

      const fund1After = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)

      expect(fund1After.WETH9).to.equal(fund1Before.WETH9.sub(swapInputAmount))
      expect(fund1After.UNI).to.be.above(fund1Before.UNI)
      expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH.sub(swapInputAmount))
      expect(manager1After.fundUNI).to.be.above(manager1Before.fundUNI)

      //revert if fundId / investor is invalid
      await expect(fund.connect(manager1).swap(
        fundId2,
        manager1.address,
        params, 
        { value: 0 }
      )).to.be.reverted
      await expect(fund.connect(manager2).swap(
        fundId1,
        manager1.address,
        params, 
        { value: 0 }
      )).to.be.reverted
      await expect(fund.connect(notInvestor).swap(
        fundId1,
        notInvestor.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })

    it("UNI -> DAI -> WETH", async function () {
      const tokens = [UNI, DAI, WETH9]
      const swapInputAmount = BigNumber.from(300000)
      const amountOutMinimum = BigNumber.from(1)

      const fund1Before = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      const params = exactInputParams(
        tokens,
        swapInputAmount,
        amountOutMinimum
      )
      await fund.connect(manager1).swap(fundId1, manager1.address, params, { value: 0 })

      const fund1After = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)

      expect(fund1After.WETH9).to.be.above(fund1Before.WETH9)
      expect(fund1After.UNI).to.equal(fund1Before.UNI.sub(swapInputAmount))
      expect(manager1After.fundWETH).to.be.above(manager1Before.fundWETH)
      expect(manager1After.fundUNI).to.equal(manager1Before.fundUNI.sub(swapInputAmount))

      //revert if fundId / investor is invalid
      await expect(fund.connect(manager1).swap(
        fundId2,
        manager1.address,
        params, 
        { value: 0 }
      )).to.be.reverted
      await expect(fund.connect(manager2).swap(
        fundId1,
        manager1.address,
        params, 
        { value: 0 }
      )).to.be.reverted
      await expect(fund.connect(notInvestor).swap(
        fundId1,
        notInvestor.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })

  })

  describe("#exactOutput", async function () {

    it("WETH -> DAI -> UNI", async function () {
      const tokens = [WETH9, DAI, UNI]
      const swapOutputAmount = BigNumber.from(3000000)
      const amountInMaximum = BigNumber.from(1000000)

      const fund1Before = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      const params = exactOutputParams(
        tokens,
        swapOutputAmount,
        amountInMaximum
      )
      await fund.connect(manager1).swap(fundId1, manager1.address, params, { value: 0 })

      const fund1After = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)

      expect(fund1After.WETH9).to.be.below(fund1Before.WETH9)
      expect(fund1After.UNI).to.equal(fund1Before.UNI.add(swapOutputAmount))
      expect(manager1After.fundWETH).to.be.below(manager1Before.fundWETH)
      expect(manager1After.fundUNI).to.equal(manager1Before.fundUNI.add(swapOutputAmount))

      //revert if fundId / investor is invalid
      await expect(fund.connect(manager1).swap(
        fundId2,
        manager1.address,
        params, 
        { value: 0 }
      )).to.be.reverted
      await expect(fund.connect(manager2).swap(
        fundId1,
        manager1.address,
        params, 
        { value: 0 }
      )).to.be.reverted
      await expect(fund.connect(notInvestor).swap(
        fundId1,
        notInvestor.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })

    it("UNI -> DAI -> WETH", async function () {
      const tokens = [UNI, DAI, WETH9]
      const swapOutputAmount = BigNumber.from(1000)
      const amountInMaximum = BigNumber.from(300000)

      const fund1Before = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      const params = exactOutputParams(
        tokens,
        swapOutputAmount,
        amountInMaximum,
        fundAddress
      )
      await fund.connect(manager1).swap(fundId1, manager1.address, params, { value: 0 })

      const fund1After = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)

      expect(fund1After.WETH9).to.equal(fund1Before.WETH9.add(swapOutputAmount))
      expect(fund1After.UNI).to.be.below(fund1Before.UNI)
      expect(manager1After.fundWETH).to.equal(manager1Before.fundWETH.add(swapOutputAmount))
      expect(manager1After.fundUNI).to.be.below(manager1Before.fundUNI)
      
      //revert if fundId / investor is invalid
      await expect(fund.connect(manager1).swap(
        fundId2,
        manager1.address,
        params, 
        { value: 0 }
      )).to.be.reverted
      await expect(fund.connect(manager2).swap(
        fundId1,
        manager1.address,
        params, 
        { value: 0 }
      )).to.be.reverted
      await expect(fund.connect(notInvestor).swap(
        fundId1,
        notInvestor.address,
        params, 
        { value: 0 }
      )).to.be.reverted
    })
  })

  describe('Mint / Add Liquidity / Collect Fee / Remove Liquidity', () => {

  })
})