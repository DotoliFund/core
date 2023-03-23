import { Wallet, constants, BigNumber, Contract } from 'ethers'
import { expect } from "chai"
import { ethers } from 'hardhat'
import {
  exactInputParams,
} from './shared/swap'
import { 
  mintParams,
  increaseParams,
  collectParams,
  decreaseParams
} from './shared/liquidity'
import { 
  WETH9,
  UNI,
  DAI,
  DOTOLI,
  WETH_CHARGE_AMOUNT,
  DEPOSIT_AMOUNT,
  FeeAmount,
  MaxUint128,
  TICK_SPACINGS,
  UNISWAP_V3_FACTORY,
  NonfungiblePositionManager
} from "./shared/constants"
import { getMaxTick, getMinTick } from './shared/ticks'


describe('Liquidity', () => {

  let deployer: Wallet 
  let manager1: Wallet
  let manager2: Wallet
  let investor1: Wallet
  let investor2: Wallet
  let notInvestor: Wallet

  let oracleAddress: string
  let settingAddress: string
  let infoAddress: string
  let fundAddress: string

  let oracle: Contract
  let setting: Contract
  let info: Contract
  let fund: Contract
  let weth9: Contract
  let uni: Contract
  let nonfungiblePositionManager: Contract
  
  let fundId1: BigNumber
  let fundId2: BigNumber

  let getFundAccount: (
    fundId: BigNumber
  ) => Promise<{
    WETH: BigNumber,
    UNI: BigNumber,
    feeTokens : string[],
  }>

  let getInvestorAccount: (
    fundId: BigNumber,
    who: string
  ) => Promise<{
    WETH: BigNumber,
    UNI: BigNumber,
    fundWETH: BigNumber,
    fundUNI: BigNumber,
  }>

  before('get signer', async () => {
    [ deployer,
      manager1,
      manager2,
      investor1,
      investor2,
      notInvestor
    ] = await (ethers as any).getSigners()

    weth9 = await ethers.getContractAt("@uniswap/v3-periphery/contracts/interfaces/external/IWETH9.sol:IWETH9", WETH9)
    uni = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", UNI)
    nonfungiblePositionManager = await ethers.getContractAt("@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol:INonfungiblePositionManager", NonfungiblePositionManager)

    getInvestorAccount = async (fundId: BigNumber, who: string) => {
      const balances = await Promise.all([
        weth9.balanceOf(who),
        uni.balanceOf(who),
        info.connect(who).getInvestorTokenAmount(fundId, who, WETH9),
        info.connect(who).getInvestorTokenAmount(fundId, who, UNI),
      ])
      return {
        WETH: balances[0],
        UNI: balances[1],
        fundWETH: balances[2],
        fundUNI: balances[3],
      }
    }

    getFundAccount = async (fundId: BigNumber) => {
      const balances = await Promise.all([
        info.connect(notInvestor).getFundTokenAmount(fundId, WETH9),
        info.connect(notInvestor).getFundTokenAmount(fundId, UNI),
        info.connect(notInvestor).getFeeTokens(fundId),
      ])
      return {
        WETH: balances[0],
        UNI: balances[1],
        feeTokens: balances[2],
      }
    }
  })

  before("Deploy LiquidityOracle Contract", async function () {
    const LiquidityOracle = await ethers.getContractFactory("LiquidityOracle")
    const Oracle = await LiquidityOracle.connect(deployer).deploy(
      UNISWAP_V3_FACTORY,
      NonfungiblePositionManager
    )
    await Oracle.deployed()
    oracleAddress = Oracle.address
    oracle = await ethers.getContractAt("LiquidityOracle", oracleAddress)
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

  describe('subscribe to fund1', () => {
    it("investor1 subscribe -> fund1", async function () {
      await info.connect(investor1).subscribe(fundId1)
    })
    it("manager2 subscribe -> fund1", async function () {
      await info.connect(manager2).subscribe(fundId1)
    })
  })

  describe('charge fund account WETH, UNI', () => {

    it("setWhiteListToken -> UNI", async function () {
      await setting.connect(deployer).setWhiteListToken(UNI)
    })

    it("charge wallet -> manager1", async function () {
      await weth9.connect(manager1).approve(fundAddress, constants.MaxUint256)
      await uni.connect(manager1).approve(fundAddress, constants.MaxUint256)
      
      //deposit
      await manager1.sendTransaction({
        to: fundAddress,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
        data: BigNumber.from(fundId1)
      })

      //swap WETH -> UNI
      const tokens = [WETH9, DAI, UNI]
      const swapInputAmount = ethers.utils.parseEther("0.5")
      const amountOutMinimum = BigNumber.from(1)
      const params = exactInputParams(
        tokens,
        swapInputAmount,
        amountOutMinimum
      )
      await fund.connect(manager1).swap(fundId1, manager1.address, params, { value: 0 })

      //withdraw ETH, UNI
      await fund.connect(manager1).withdraw(fundId1, WETH9, ethers.utils.parseEther("0.1"))
      await fund.connect(manager1).withdraw(fundId1, UNI, ethers.utils.parseEther("0.1"))

      //get WETH in wallet
      await weth9.connect(manager1).deposit({
        from: manager1.address,
        value: WETH_CHARGE_AMOUNT
      })
    })
    it("charge wallet -> investor1", async function () {
      await weth9.connect(investor1).approve(fundAddress, constants.MaxUint256)
      await uni.connect(investor1).approve(fundAddress, constants.MaxUint256)
      
      //deposit
      await investor1.sendTransaction({
        to: fundAddress,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
        data: BigNumber.from(fundId1)
      })     

      //swap WETH -> UNI
      const tokens = [WETH9, DAI, UNI]
      const swapInputAmount = ethers.utils.parseEther("0.5")
      const amountOutMinimum = BigNumber.from(1)
      const params = exactInputParams(
        tokens,
        swapInputAmount,
        amountOutMinimum
      )
      await fund.connect(manager1).swap(fundId1, investor1.address, params, { value: 0 })

      //withdraw ETH, UNI
      await fund.connect(investor1).withdraw(fundId1, WETH9, ethers.utils.parseEther("0.1"))
      await fund.connect(investor1).withdraw(fundId1, UNI, ethers.utils.parseEther("0.1"))

      //get WETH in wallet
      await weth9.connect(investor1).deposit({
        from: investor1.address,
        value: WETH_CHARGE_AMOUNT
      })
    })
    it("charge wallet -> manager2", async function () {
      await weth9.connect(manager2).approve(fundAddress, constants.MaxUint256)
      await uni.connect(manager2).approve(fundAddress, constants.MaxUint256)
      
      //deposit
      await manager2.sendTransaction({
        to: fundAddress,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
        data: BigNumber.from(fundId1)
      })

      //swap WETH -> UNI
      const tokens = [WETH9, DAI, UNI]
      const swapInputAmount = ethers.utils.parseEther("0.5")
      const amountOutMinimum = BigNumber.from(1)
      const params = exactInputParams(
        tokens,
        swapInputAmount,
        amountOutMinimum
      )
      await fund.connect(manager1).swap(fundId1, manager2.address, params, { value: 0 })

      //withdraw ETH, UNI
      await fund.connect(manager2).withdraw(fundId1, WETH9, ethers.utils.parseEther("0.1"))
      await fund.connect(manager2).withdraw(fundId1, UNI, ethers.utils.parseEther("0.1"))

      //get WETH in wallet
      await weth9.connect(manager2).deposit({
        from: manager2.address,
        value: WETH_CHARGE_AMOUNT
      })
    })
    it("charge wallet -> notInvestor", async function () {
      // do nothing
    })
  })

  describe('mintNewPosition', () => {

    it("mintNewPosition -> only manager", async function () {
      const params = mintParams(
        UNI,
        WETH9,
        FeeAmount.MEDIUM,
        getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        BigNumber.from(20000),
        BigNumber.from(100),
        BigNumber.from(2000),
        BigNumber.from(10),
      )

      const fundBefore = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      await fund.connect(manager1).mintNewPosition(
        fundId1,
        manager1.address,
        params, 
        { value: 0 }
      )

      const fundAfter = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)
      expect(fundAfter.UNI).to.be.below(fundBefore.UNI.sub(2000))
      expect(fundAfter.WETH).to.be.below(fundBefore.WETH.sub(10))
      expect(manager1After.fundUNI).to.be.below(manager1Before.fundUNI.sub(2000))
      expect(manager1After.fundWETH).to.be.below(manager1Before.fundWETH.sub(10))
      
      const investor1Before = await getInvestorAccount(fundId1, investor1.address)

      await fund.connect(manager1).mintNewPosition(
        fundId1,
        investor1.address,
        params, 
        { value: 0 }
      )

      const fundAfter2 = await getFundAccount(fundId1)
      const investor1After = await getInvestorAccount(fundId1, investor1.address)
      expect(fundAfter2.UNI).to.be.below(fundAfter.UNI.sub(2000))
      expect(fundAfter2.WETH).to.be.below(fundAfter.WETH.sub(10))
      expect(investor1After.fundUNI).to.be.below(investor1Before.fundUNI.sub(2000))
      expect(investor1After.fundWETH).to.be.below(investor1Before.fundWETH.sub(10))

      const manager2Before = await getInvestorAccount(fundId1, manager2.address)

      await fund.connect(manager1).mintNewPosition(
        fundId1,
        manager2.address,
        params, 
        { value: 0 }
      )

      const fundAfter3 = await getFundAccount(fundId1)
      const manager2After = await getInvestorAccount(fundId1, manager2.address)
      expect(fundAfter3.UNI).to.be.below(fundAfter2.UNI.sub(2000))
      expect(fundAfter3.WETH).to.be.below(fundAfter2.WETH.sub(10))
      expect(manager2After.fundUNI).to.be.below(manager2Before.fundUNI.sub(2000))
      expect(manager2After.fundWETH).to.be.below(manager2Before.fundWETH.sub(10))

      await expect(fund.connect(investor1).mintNewPosition(
        fundId1,
        manager1.address,
        params, 
        { value: 0 }
      )).to.be.revertedWith('NM')
      await expect(fund.connect(investor1).mintNewPosition(
        fundId1,
        investor1.address,
        params, 
        { value: 0 }
      )).to.be.revertedWith('NM')
      await expect(fund.connect(investor1).mintNewPosition(
        fundId1,
        manager2.address,
        params, 
        { value: 0 }
      )).to.be.revertedWith('NM')

      await expect(fund.connect(manager2).mintNewPosition(
        fundId1,
        manager1.address,
        params, 
        { value: 0 }
      )).to.be.revertedWith('NM')
      await expect(fund.connect(manager2).mintNewPosition(
        fundId1,
        investor1.address,
        params, 
        { value: 0 }
      )).to.be.revertedWith('NM')
      await expect(fund.connect(manager2).mintNewPosition(
        fundId1,
        manager2.address,
        params, 
        { value: 0 }
      )).to.be.revertedWith('NM')
    })

    it("invalid case", async function () {

    })

  })


  describe('increaseLiquidity', () => {

    it("increaseLiquidity -> manager1", async function () {
      const WETHAmount = BigNumber.from(100)
      const UNIAmount = BigNumber.from(20000)
      const minWETHAmount = BigNumber.from(10)
      const minUNIAmount = BigNumber.from(2000)

      const fundBefore = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager1.address)
      const tokenId = await nonfungiblePositionManager.connect(manager1).positions(tokenIds[0])

      let params 
      if (tokenId.token0 == WETH9 && tokenId.token1 == UNI) {
        params = increaseParams(
          tokenIds[0],
          WETHAmount,
          UNIAmount,
          minWETHAmount,
          minUNIAmount,
        )
      } else {
        params = increaseParams(
          tokenIds[0],
          UNIAmount,
          WETHAmount,
          minUNIAmount,
          minWETHAmount,
        )
      }

      await fund.connect(manager1).increaseLiquidity(
        fundId1,
        params, 
        { value: 0 }
      )

      const fundAfter = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)
      expect(fundAfter.UNI).to.be.below(fundBefore.UNI.sub(minUNIAmount))
      expect(fundAfter.WETH).to.be.below(fundBefore.WETH.sub(minWETHAmount))
      expect(manager1After.fundUNI).to.be.below(manager1Before.fundUNI.sub(minUNIAmount))
      expect(manager1After.fundWETH).to.be.below(manager1Before.fundWETH.sub(minWETHAmount))
    })

    it("increaseLiquidity -> investor1", async function () {
      const WETHAmount = BigNumber.from(100)
      const UNIAmount = BigNumber.from(20000)
      const minWETHAmount = BigNumber.from(10)
      const minUNIAmount = BigNumber.from(2000)

      const fundBefore = await getFundAccount(fundId1)
      const investor1Before = await getInvestorAccount(fundId1, investor1.address)

      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, investor1.address)
      const tokenId = await nonfungiblePositionManager.connect(manager1).positions(tokenIds[0])

      let params 
      if (tokenId.token0 == WETH9 && tokenId.token1 == UNI) {
        params = increaseParams(
          tokenIds[0],
          WETHAmount,
          UNIAmount,
          minWETHAmount,
          minUNIAmount,
        )
      } else {
        params = increaseParams(
          tokenIds[0],
          UNIAmount,
          WETHAmount,
          minUNIAmount,
          minWETHAmount,
        )
      }

      await fund.connect(manager1).increaseLiquidity(
        fundId1,
        params, 
        { value: 0 }
      )

      const fundAfter = await getFundAccount(fundId1)
      const investor1After = await getInvestorAccount(fundId1, investor1.address)
      expect(fundAfter.UNI).to.be.below(fundBefore.UNI.sub(minUNIAmount))
      expect(fundAfter.WETH).to.be.below(fundBefore.WETH.sub(minWETHAmount))
      expect(investor1After.fundUNI).to.be.below(investor1Before.fundUNI.sub(minUNIAmount))
      expect(investor1After.fundWETH).to.be.below(investor1Before.fundWETH.sub(minWETHAmount))
    })

    it("increaseLiquidity -> manager2", async function () {
      const WETHAmount = BigNumber.from(100)
      const UNIAmount = BigNumber.from(20000)
      const minWETHAmount = BigNumber.from(10)
      const minUNIAmount = BigNumber.from(2000)

      const fundBefore = await getFundAccount(fundId1)
      const manager2Before = await getInvestorAccount(fundId1, manager2.address)

      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager2.address)
      const tokenId = await nonfungiblePositionManager.connect(manager1).positions(tokenIds[0])

      let params 
      if (tokenId.token0 == WETH9 && tokenId.token1 == UNI) {
        params = increaseParams(
          tokenIds[0],
          WETHAmount,
          UNIAmount,
          minWETHAmount,
          minUNIAmount,
        )
      } else {
        params = increaseParams(
          tokenIds[0],
          UNIAmount,
          WETHAmount,
          minUNIAmount,
          minWETHAmount,
        )
      }

      await fund.connect(manager1).increaseLiquidity(
        fundId1,
        params, 
        { value: 0 }
      )

      const fundAfter = await getFundAccount(fundId1)
      const manager2After = await getInvestorAccount(fundId1, manager2.address)
      expect(fundAfter.UNI).to.be.below(fundBefore.UNI.sub(minUNIAmount))
      expect(fundAfter.WETH).to.be.below(fundBefore.WETH.sub(minWETHAmount))
      expect(manager2After.fundUNI).to.be.below(manager2Before.fundUNI.sub(minUNIAmount))
      expect(manager2After.fundWETH).to.be.below(manager2Before.fundWETH.sub(minWETHAmount))
    })


    it("increaseLiquidity -> only manager", async function () {
      const WETHAmount = BigNumber.from(100)
      const UNIAmount = BigNumber.from(20000)
      const minWETHAmount = BigNumber.from(10)
      const minUNIAmount = BigNumber.from(2000)

      const fundBefore = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, investor1.address)
      const tokenId = await nonfungiblePositionManager.connect(manager1).positions(tokenIds[0])

      let params 
      if (tokenId.token0 == WETH9 && tokenId.token1 == UNI) {
        params = increaseParams(
          tokenIds[0],
          WETHAmount,
          UNIAmount,
          minWETHAmount,
          minUNIAmount,
        )
      } else {
        params = increaseParams(
          tokenIds[0],
          UNIAmount,
          WETHAmount,
          minUNIAmount,
          minWETHAmount,
        )
      }

      await expect(fund.connect(investor1).increaseLiquidity(
        fundId1,
        params, 
        { value: 0 }
      )).to.be.revertedWith('NM')

      const tokenIds2 = await info.connect(manager1).getTokenIds(fundId1, manager2.address)
      const tokenId2 = await nonfungiblePositionManager.connect(manager1).positions(tokenIds2[0])

      let params2 
      if (tokenId2.token0 == WETH9 && tokenId2.token1 == UNI) {
        params2 = increaseParams(
          tokenIds2[0],
          WETHAmount,
          UNIAmount,
          minWETHAmount,
          minUNIAmount,
        )
      } else {
        params2 = increaseParams(
          tokenIds2[0],
          UNIAmount,
          WETHAmount,
          minUNIAmount,
          minWETHAmount,
        )
      }

      await expect(fund.connect(manager2).increaseLiquidity(
        fundId1,
        params2, 
        { value: 0 }
      )).to.be.revertedWith('NM')
    })

    it("invalid case", async function () {

    })

  })


  describe('collectPositionFee', () => {

    it("collectPositionFee -> manager", async function () {
      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager1.address)
      const params = collectParams(
        tokenIds[0],
        MaxUint128,
        MaxUint128
      )

      const fundBefore = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      await fund.connect(manager1).collectPositionFee(
        fundId1,
        params, 
        { value: 0 }
      )

      const fundAfter = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)
      expect(fundAfter.UNI).to.be.at.least(fundBefore.UNI)
      expect(fundAfter.WETH).to.be.at.least(fundBefore.WETH)
      expect(fundAfter.feeTokens[0][1]).to.be.at.least(fundBefore.feeTokens[0][1]) //feeTokens[0][1] : weth amount
      expect(fundAfter.feeTokens[1][1]).to.be.at.least(fundBefore.feeTokens[1][1]) //feeTokens[0][1] : uni amount
      expect(manager1After.fundUNI).to.be.at.least(manager1Before.fundUNI)
      expect(manager1After.fundWETH).to.be.at.least(manager1Before.fundWETH)
    })

    it("collectPositionFee -> investor1", async function () {
      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, investor1.address)
      const params = collectParams(
        tokenIds[0],
        MaxUint128,
        MaxUint128
      )

      const fundBefore = await getFundAccount(fundId1)
      const investor1Before = await getInvestorAccount(fundId1, investor1.address)

      await fund.connect(manager1).collectPositionFee(
        fundId1,
        params, 
        { value: 0 }
      )

      const fundAfter = await getFundAccount(fundId1)
      const investor1After = await getInvestorAccount(fundId1, investor1.address)
      expect(fundAfter.UNI).to.be.at.least(fundBefore.UNI)
      expect(fundAfter.WETH).to.be.at.least(fundBefore.WETH)
      expect(fundAfter.feeTokens[0][1]).to.be.at.least(fundBefore.feeTokens[0][1]) //feeTokens[0][1] : weth amount
      expect(fundAfter.feeTokens[1][1]).to.be.at.least(fundBefore.feeTokens[1][1]) //feeTokens[0][1] : uni amount
      expect(investor1After.fundUNI).to.be.at.least(investor1Before.fundUNI)
      expect(investor1After.fundWETH).to.be.at.least(investor1Before.fundWETH)
    })

    it("collectPositionFee -> manager2", async function () {
      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager2.address)
      const params = collectParams(
        tokenIds[0],
        MaxUint128,
        MaxUint128
      )

      const fundBefore = await getFundAccount(fundId1)
      const manager2Before = await getInvestorAccount(fundId1, manager2.address)

      await fund.connect(manager1).collectPositionFee(
        fundId1,
        params, 
        { value: 0 }
      )

      const fundAfter = await getFundAccount(fundId1)
      const manager2After = await getInvestorAccount(fundId1, manager2.address)
      expect(fundAfter.UNI).to.be.at.least(fundBefore.UNI)
      expect(fundAfter.WETH).to.be.at.least(fundBefore.WETH)
      expect(fundAfter.feeTokens[0][1]).to.be.at.least(fundBefore.feeTokens[0][1]) //feeTokens[0][1] : weth amount
      expect(fundAfter.feeTokens[1][1]).to.be.at.least(fundBefore.feeTokens[1][1]) //feeTokens[0][1] : uni amount
      expect(manager2After.fundUNI).to.be.at.least(manager2Before.fundUNI)
      expect(manager2After.fundWETH).to.be.at.least(manager2Before.fundWETH)
    })

    it("collectPositionFee -> only manager, investor", async function () {
      const tokenIds = await info.connect(investor1).getTokenIds(fundId1, investor1.address)
      const params = collectParams(
        tokenIds[0],
        MaxUint128,
        MaxUint128
      )

      const fundBefore = await getFundAccount(fundId1)
      const investor1Before = await getInvestorAccount(fundId1, investor1.address)

      await fund.connect(investor1).collectPositionFee(
        fundId1,
        params, 
        { value: 0 }
      )

      const fundAfter = await getFundAccount(fundId1)
      const investor1After = await getInvestorAccount(fundId1, investor1.address)
      expect(fundAfter.UNI).to.be.at.least(fundBefore.UNI)
      expect(fundAfter.WETH).to.be.at.least(fundBefore.WETH)
      expect(fundAfter.feeTokens[0][1]).to.be.at.least(fundBefore.feeTokens[0][1]) //feeTokens[0][1] : weth amount
      expect(fundAfter.feeTokens[1][1]).to.be.at.least(fundBefore.feeTokens[1][1]) //feeTokens[0][1] : uni amount
      expect(investor1After.fundUNI).to.be.at.least(investor1Before.fundUNI)
      expect(investor1After.fundWETH).to.be.at.least(investor1Before.fundWETH)


      const tokenIds2 = await info.connect(manager2).getTokenIds(fundId1, manager2.address)
      const params2 = collectParams(
        tokenIds2[0],
        MaxUint128,
        MaxUint128
      )

      const manager2Before = await getInvestorAccount(fundId1, manager2.address)

      await fund.connect(manager2).collectPositionFee(
        fundId1,
        params2, 
        { value: 0 }
      )

      const fundAfter2 = await getFundAccount(fundId1)
      const manager2After = await getInvestorAccount(fundId1, manager2.address)
      expect(fundAfter2.UNI).to.be.at.least(fundAfter.UNI)
      expect(fundAfter2.WETH).to.be.at.least(fundAfter.WETH)
      expect(fundAfter2.feeTokens[0][1]).to.be.at.least(fundAfter.feeTokens[0][1]) //feeTokens[0][1] : weth amount
      expect(fundAfter2.feeTokens[1][1]).to.be.at.least(fundAfter.feeTokens[1][1]) //feeTokens[0][1] : uni amount
      expect(manager2After.fundUNI).to.be.at.least(manager2Before.fundUNI)
      expect(manager2After.fundWETH).to.be.at.least(manager2Before.fundWETH)
    })

    it("invalid parameter", async function () {
      const tokenIds = await info.connect(investor1).getTokenIds(fundId1, manager2.address)
      const params = collectParams(
        tokenIds[0],
        MaxUint128,
        MaxUint128
      )

      await expect(fund.connect(investor1).collectPositionFee(
        fundId1,
        params, 
        { value: 0 }
      )).to.be.revertedWith('NA')

      const tokenIds2 = await info.connect(manager2).getTokenIds(fundId1, investor1.address)
      const params2 = collectParams(
        tokenIds2[0],
        MaxUint128,
        MaxUint128
      )
      
      await expect(fund.connect(manager2).collectPositionFee(
        fundId1,
        params2, 
        { value: 0 }
      )).to.be.revertedWith('NA')
    })

    it("invalid case", async function () {

    })

  })


  describe('decreaseLiquidity', () => {

    it("decreaseLiquidity -> manager", async function () {
      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager1.address)
      const params = decreaseParams(
        tokenIds[0],
        1000,
        BigNumber.from(2000),
        BigNumber.from(10),
      )

      const fundBefore = await getFundAccount(fundId1)
      const manager1Before = await getInvestorAccount(fundId1, manager1.address)

      await fund.connect(manager1).decreaseLiquidity(
        fundId1,
        params, 
        { value: 0 }
      )

      const fundAfter = await getFundAccount(fundId1)
      const manager1After = await getInvestorAccount(fundId1, manager1.address)
      expect(fundAfter.UNI).to.be.at.least(fundBefore.UNI)
      expect(fundAfter.WETH).to.be.at.least(fundBefore.WETH)
      expect(fundAfter.feeTokens[0][1]).to.be.at.least(fundBefore.feeTokens[0][1]) //feeTokens[0][1] : weth amount
      expect(fundAfter.feeTokens[1][1]).to.be.at.least(fundBefore.feeTokens[1][1]) //feeTokens[0][1] : uni amount
      expect(manager1After.fundUNI).to.be.at.least(manager1Before.fundUNI)
      expect(manager1After.fundWETH).to.be.at.least(manager1Before.fundWETH)
    })

    it("decreaseLiquidity -> investor1", async function () {
      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, investor1.address)
      const params = decreaseParams(
        tokenIds[0],
        1000,
        BigNumber.from(2000),
        BigNumber.from(10),
      )

      const fundBefore = await getFundAccount(fundId1)
      const investor1Before = await getInvestorAccount(fundId1, investor1.address)

      await fund.connect(manager1).decreaseLiquidity(
        fundId1,
        params, 
        { value: 0 }
      )

      const fundAfter = await getFundAccount(fundId1)
      const investor1After = await getInvestorAccount(fundId1, investor1.address)
      expect(fundAfter.UNI).to.be.at.least(fundBefore.UNI)
      expect(fundAfter.WETH).to.be.at.least(fundBefore.WETH)
      expect(fundAfter.feeTokens[0][1]).to.be.at.least(fundBefore.feeTokens[0][1]) //feeTokens[0][1] : weth amount
      expect(fundAfter.feeTokens[1][1]).to.be.at.least(fundBefore.feeTokens[1][1]) //feeTokens[0][1] : uni amount
      expect(investor1After.fundUNI).to.be.at.least(investor1Before.fundUNI)
      expect(investor1After.fundWETH).to.be.at.least(investor1Before.fundWETH)
    })

    it("decreaseLiquidity -> manager2", async function () {
      const tokenIds = await info.connect(manager1).getTokenIds(fundId1, manager2.address)
      const params = decreaseParams(
        tokenIds[0],
        1000,
        BigNumber.from(2000),
        BigNumber.from(10),
      )

      const fundBefore = await getFundAccount(fundId1)
      const manager2Before = await getInvestorAccount(fundId1, manager2.address)

      await fund.connect(manager1).decreaseLiquidity(
        fundId1,
        params, 
        { value: 0 }
      )

      const fundAfter = await getFundAccount(fundId1)
      const manager2After = await getInvestorAccount(fundId1, manager2.address)
      expect(fundAfter.UNI).to.be.at.least(fundBefore.UNI)
      expect(fundAfter.WETH).to.be.at.least(fundBefore.WETH)
      expect(fundAfter.feeTokens[0][1]).to.be.at.least(fundBefore.feeTokens[0][1]) //feeTokens[0][1] : weth amount
      expect(fundAfter.feeTokens[1][1]).to.be.at.least(fundBefore.feeTokens[1][1]) //feeTokens[0][1] : uni amount
      expect(manager2After.fundUNI).to.be.at.least(manager2Before.fundUNI)
      expect(manager2After.fundWETH).to.be.at.least(manager2Before.fundWETH)
    })

    it("decreaseLiquidity -> only manager, investor", async function () {
      const tokenIds = await info.connect(investor1).getTokenIds(fundId1, investor1.address)
      const params = decreaseParams(
        tokenIds[0],
        1000,
        BigNumber.from(2000),
        BigNumber.from(10),
      )

      const fundBefore = await getFundAccount(fundId1)
      const investor1Before = await getInvestorAccount(fundId1, investor1.address)

      await fund.connect(investor1).decreaseLiquidity(
        fundId1,
        params, 
        { value: 0 }
      )

      const fundAfter = await getFundAccount(fundId1)
      const investor1After = await getInvestorAccount(fundId1, investor1.address)
      expect(fundAfter.UNI).to.be.at.least(fundBefore.UNI)
      expect(fundAfter.WETH).to.be.at.least(fundBefore.WETH)
      expect(fundAfter.feeTokens[0][1]).to.be.at.least(fundBefore.feeTokens[0][1]) //feeTokens[0][1] : weth amount
      expect(fundAfter.feeTokens[1][1]).to.be.at.least(fundBefore.feeTokens[1][1]) //feeTokens[0][1] : uni amount
      expect(investor1After.fundUNI).to.be.at.least(investor1Before.fundUNI)
      expect(investor1After.fundWETH).to.be.at.least(investor1Before.fundWETH)


      const tokenIds2 = await info.connect(manager2).getTokenIds(fundId1, manager2.address)
      const params2 = decreaseParams(
        tokenIds2[0],
        1000,
        BigNumber.from(2000),
        BigNumber.from(10),
      )

      const manager2Before = await getInvestorAccount(fundId1, manager2.address)

      await fund.connect(manager2).decreaseLiquidity(
        fundId1,
        params2, 
        { value: 0 }
      )

      const fundAfter2 = await getFundAccount(fundId1)
      const manager2After = await getInvestorAccount(fundId1, manager2.address)
      expect(fundAfter2.UNI).to.be.at.least(fundAfter.UNI)
      expect(fundAfter2.WETH).to.be.at.least(fundAfter.WETH)
      expect(fundAfter2.feeTokens[0][1]).to.be.at.least(fundAfter.feeTokens[0][1]) //feeTokens[0][1] : weth amount
      expect(fundAfter2.feeTokens[1][1]).to.be.at.least(fundAfter.feeTokens[1][1]) //feeTokens[0][1] : uni amount
      expect(manager2After.fundUNI).to.be.at.least(manager2Before.fundUNI)
      expect(manager2After.fundWETH).to.be.at.least(manager2Before.fundWETH)
    })

    it("invalid parameter", async function () {
      const tokenIds = await info.connect(investor1).getTokenIds(fundId1, manager2.address)
      const params = decreaseParams(
        tokenIds[0],
        1000,
        BigNumber.from(2000),
        BigNumber.from(10),
      )

      await expect(fund.connect(investor1).decreaseLiquidity(
        fundId1,
        params, 
        { value: 0 }
      )).to.be.revertedWith('NA')

      const tokenIds2 = await info.connect(manager2).getTokenIds(fundId1, investor1.address)
      const params2 = decreaseParams(
        tokenIds2[0],
        1000,
        BigNumber.from(2000),
        BigNumber.from(10),
      )
      
      await expect(fund.connect(manager2).decreaseLiquidity(
        fundId1,
        params2, 
        { value: 0 }
      )).to.be.revertedWith('NA')
    })

    it("invalid case", async function () {

    })

  })

})