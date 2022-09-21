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


describe('XXXFund2', () => {

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

    it("Deploy XXXFactory Contract", async function () {
      const XXXFactory = await ethers.getContractFactory("XXXFactory")
      const Factory = await XXXFactory.connect(deployer).deploy()
      await Factory.deployed()
      FactoryContractAddress = Factory.address
    })

    it("Deploy XXXFund2 Contract", async function () {
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

    it("factory", async function () {
      const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
      expect(await newFundContract.connect(manager).factory()).to.equal(FactoryContractAddress)
    })

    it("manager", async function () {
      const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
      expect(await newFundContract.connect(manager).manager()).to.equal(manager.address)
    })

    it("ETH -> WETH", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
      const beforeWETHBalance = await WETH9.balanceOf(manager.address)
      await WETH9.connect(manager).deposit({
                from: manager.address,
                value: WETH_CHARGE_AMOUNT
            })
      const afterWETHBalance = await WETH9.balanceOf(manager.address)
      expect(afterWETHBalance).to.equal(beforeWETHBalance.add(WETH_CHARGE_AMOUNT))
    })

    it("deposit ETH => receive()", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
      const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)
      await manager.sendTransaction({
        to: NewFundAddress,
        value: DEPOSIT_AMOUNT, // Sends exactly 1.0 ether
      })

      //check investorTokenCount
      const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
      const investorTokenCount = await newFundContract.connect(manager).investorTokenCount(manager.address)
      expect(investorTokenCount).to.equal(1)

      //check investorTokens
      const investorTokens = await newFundContract.connect(manager).getInvestorTokens(manager.address)
      const token = investorTokens[0][0]
      const amount = investorTokens[0][1]
      expect(token).to.equal(WETH9_MAINNET)
      expect(amount).to.equal(beforeFundWETHBalance.add(DEPOSIT_AMOUNT))

      //check rewardTokens
      const rewardTokens = await newFundContract.connect(manager).getRewardTokens()
      expect(rewardTokens).to.be.empty

      //check fund balance
      const afterFundWETHBalance = await WETH9.balanceOf(NewFundAddress)
      expect(afterFundWETHBalance).to.equal(beforeFundWETHBalance.add(DEPOSIT_AMOUNT))
    })

    it("withdraw ETH", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
      const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)

      const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
      
      const beforeInvestorTokens = await newFundContract.connect(manager).getInvestorTokens(manager.address)
      const token = beforeInvestorTokens[0][0]
      const beforeWithdrawAmount = beforeInvestorTokens[0][1]

      await newFundContract.connect(manager).withdraw(manager.address, WETH9_MAINNET, WITHDRAW_AMOUNT)

      //check investorTokenCount
      const investorTokenCount = await newFundContract.connect(manager).investorTokenCount(manager.address)
      expect(investorTokenCount).to.equal(1)

      //check investorTokens
      const afterInvestorTokens = await newFundContract.connect(manager).getInvestorTokens(manager.address)
      const token2 = beforeInvestorTokens[0][0]
      const afterWithdrawAmount = afterInvestorTokens[0][1]
      expect(token).to.equal(token2)
      expect(token2).to.equal(WETH9_MAINNET)
      expect(afterWithdrawAmount).to.equal(beforeWithdrawAmount.sub(WITHDRAW_AMOUNT))

      //check rewardTokens
      const rewardTokens = await newFundContract.connect(manager).getRewardTokens()
      expect(rewardTokens).to.be.empty

      //check fund balance
      const afterFundWETHBalance = await WETH9.balanceOf(NewFundAddress)
      expect(afterFundWETHBalance).to.equal(beforeFundWETHBalance.sub(WITHDRAW_AMOUNT))
    })

    it("deposit WETH", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
      const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)

      await WETH9.connect(manager).approve(NewFundAddress, constants.MaxUint256)
      const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
      
      const beforeInvestorTokens = await newFundContract.connect(manager).getInvestorTokens(manager.address)
      const token = beforeInvestorTokens[0][0]
      const beforeWithdrawAmount = beforeInvestorTokens[0][1]

      await newFundContract.connect(manager).deposit(manager.address, WETH9_MAINNET, DEPOSIT_AMOUNT)

      //check investorTokenCount
      const investorTokenCount = await newFundContract.connect(manager).investorTokenCount(manager.address)
      expect(investorTokenCount).to.equal(1)

      //check investorTokens
      const afterInvestorTokens = await newFundContract.connect(manager).getInvestorTokens(manager.address)
      const token2 = beforeInvestorTokens[0][0]
      const afterWithdrawAmount = afterInvestorTokens[0][1]
      expect(token).to.equal(token2)
      expect(token2).to.equal(WETH9_MAINNET)
      expect(afterWithdrawAmount).to.equal(beforeWithdrawAmount.add(DEPOSIT_AMOUNT))

      //check rewardTokens
      const rewardTokens = await newFundContract.connect(manager).getRewardTokens()
      expect(rewardTokens).to.be.empty

      //check fund balance
      const afterFundWETHBalance = await WETH9.balanceOf(NewFundAddress)
      expect(afterFundWETHBalance).to.equal(beforeFundWETHBalance.add(DEPOSIT_AMOUNT))
    })

    it("withdraw WETH", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
      const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)
      const beforeManagerWETHBalance = await WETH9.balanceOf(manager.address)

      const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
      const beforeInvestorTokens = await newFundContract.connect(manager).getInvestorTokens(manager.address)
      const token = beforeInvestorTokens[0][0]
      const beforeWithdrawAmount = beforeInvestorTokens[0][1]
      
      await newFundContract.connect(manager).withdraw(manager.address, WETH9_MAINNET, WITHDRAW_AMOUNT)

      //check investorTokenCount
      const investorTokenCount = await newFundContract.connect(manager).investorTokenCount(manager.address)
      expect(investorTokenCount).to.equal(1)

      //check investorTokens
      const afterInvestorTokens = await newFundContract.connect(manager).getInvestorTokens(manager.address)
      const token2 = beforeInvestorTokens[0][0]
      const afterWithdrawAmount = afterInvestorTokens[0][1]
      expect(token).to.equal(token2)
      expect(token2).to.equal(WETH9_MAINNET)
      expect(afterWithdrawAmount).to.equal(beforeWithdrawAmount.sub(WITHDRAW_AMOUNT))

      //check rewardTokens
      const rewardTokens = await newFundContract.connect(manager).getRewardTokens()
      expect(rewardTokens).to.be.empty

      //check fund balance
      const afterFundWETHBalance = await WETH9.balanceOf(NewFundAddress)
      expect(afterFundWETHBalance).to.equal(beforeFundWETHBalance.sub(WITHDRAW_AMOUNT))
    })


    it("swap() -> exactInputSingle()", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
      //const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)

      await WETH9.connect(manager).approve(NewFundAddress, constants.MaxUint256)
      const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
      
      //const beforeInvestorTokens = await newFundContract.connect(manager).getInvestorTokens(manager.address)
      //const token = beforeInvestorTokens[0][0]
      //const beforeWithdrawAmount = beforeInvestorTokens[0][1]

      await newFundContract.connect(manager).deposit(manager.address, WETH9_MAINNET, DEPOSIT_AMOUNT)

      const trades = EXACT_INPUT_SINGLE_PARAMS

      await newFundContract.connect(manager).swap(trades)

      //check investorTokenCount

      //check investorTokens

      //check rewardTokens

      //check investor fund balance


    })

    // it("swap() -> exacOutputSingle()", async function () {

    // })

    // it("swap() -> exactInput()", async function () {

    // })

    // it("swap() -> exactOutput()", async function () {

    // })

  })


  // describe('sender : investor', () => {
  
  //   let deployer: Wallet, manager: Wallet, investor: Wallet

  //   let FactoryContractAddress = ''
  //   let FundContractAddress = ''
  //   let NewFundAddress = ''

  //   let fundBytecode = ''

  //   before('get signer', async () => {
  //     [deployer, manager, investor] = await (ethers as any).getSigners()
  //   })
  //   before('load fund bytecode', async () => {
  //     fundBytecode = (await ethers.getContractFactory('XXXFund2')).bytecode
  //   })

  //   it("Deploy XXXFactory Contract", async function () {
  //     const XXXFactory = await ethers.getContractFactory("XXXFactory")
  //     const Factory = await XXXFactory.connect(deployer).deploy()
  //     await Factory.deployed()
  //     FactoryContractAddress = Factory.address
  //   })

  //   it("Deploy XXXFund2 Contract", async function () {
  //     const XXXFund = await ethers.getContractFactory("XXXFund2")
  //     const Fund = await XXXFund.connect(deployer).deploy()
  //     await Fund.deployed()
  //     FundContractAddress = Fund.address
  //   })

  //   it("createFund()", async function () {
  //     const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
  //     await FactoryContract.connect(manager).createFund(manager.address)
  //     const expectedFundAddress = getCreate2Address(FactoryContractAddress, manager.address, fundBytecode)
  //     const savedFundAddress = await FactoryContract.connect(manager).getFundByManager(manager.address)
  //     expect(savedFundAddress).to.equal(expectedFundAddress)
  //     NewFundAddress = expectedFundAddress
  //   })

  //   //investor is different from not investor at addInvestorFundList(), isInvestorFundExist()
  //   it("not investor yet => isInvestorFundExist()", async function () {
  //     const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
  //     expect(await FactoryContract.connect(investor).isInvestorFundExist(investor.address, NewFundAddress)).to.be.false
  //   })
  //   it("register investor => addInvestorFundList()", async function () {
  //     const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
  //     FactoryContract.connect(investor).addInvestorFundList(NewFundAddress)
  //   })
  //   it("now check investor => isInvestorFundExist()", async function () {
  //     const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
  //     expect(await FactoryContract.connect(investor).isInvestorFundExist(investor.address, NewFundAddress)).to.be.true
  //   })

  //   it("ETH -> WETH", async function () {
  //     const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
  //     const beforeWETHBalance = await WETH9.balanceOf(investor.address)
  //     await WETH9.connect(investor).deposit({
  //               from: investor.address,
  //               value: WETH_CHARGE_AMOUNT
  //           })
  //     const afterWETHBalance = await WETH9.balanceOf(investor.address)
  //     expect(afterWETHBalance).to.equal(beforeWETHBalance.add(WETH_CHARGE_AMOUNT))
  //   })

  //   it("deposit ETH => receive()", async function () {
  //     const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
  //     const beforeWETHBalance = await WETH9.balanceOf(NewFundAddress)
  //     await investor.sendTransaction({
  //       to: NewFundAddress,
  //       value: ethers.utils.parseEther("1.0"), // Sends exactly 1.0 ether
  //     })
  //     const afterFundWETHBalance = await WETH9.balanceOf(NewFundAddress)
  //     expect(afterFundWETHBalance).to.equal(beforeWETHBalance.add(ethers.utils.parseEther("1.0")))
  //   })

  //   it("withdraw ETH ( MANAGER_FEE 1% )", async function () {
  //     const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
  //     const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)

  //     const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
  //     await newFundContract.connect(investor).withdraw(investor.address, WETH9_MAINNET, WITHDRAW_AMOUNT)

  //     const fee = WITHDRAW_AMOUNT.mul(MANAGER_FEE).div(100)
  //     const investorWithdrawAmount = WITHDRAW_AMOUNT.sub(fee)

  //     const afterFundWETHBalance = await WETH9.balanceOf(NewFundAddress)
  //     expect(afterFundWETHBalance).to.equal(beforeFundWETHBalance.sub(investorWithdrawAmount))
  //   })

  //   it("deposit WETH", async function () {
  //     const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
  //     const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)

  //     await WETH9.connect(investor).approve(NewFundAddress, constants.MaxUint256)
  //     const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
  //     await newFundContract.connect(investor).deposit(investor.address, WETH9_MAINNET, DEPOSIT_AMOUNT)

  //     const afterFundWETHBalance = await WETH9.balanceOf(NewFundAddress)
  //     expect(afterFundWETHBalance).to.equal(beforeFundWETHBalance.add(DEPOSIT_AMOUNT))
  //   })

  //   it("withdraw WETH ( MANAGER_FEE 1% )", async function () {
  //     const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
  //     const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)
  //     const beforeManagerWETHBalance = await WETH9.balanceOf(investor.address)

  //     const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
  //     await newFundContract.connect(investor).withdraw(investor.address, WETH9_MAINNET, WITHDRAW_AMOUNT)

  //     const fee = WITHDRAW_AMOUNT.mul(MANAGER_FEE).div(100)
  //     const investorWithdrawAmount = WITHDRAW_AMOUNT.sub(fee)

  //     const afterFundWETHBalance = await WETH9.balanceOf(NewFundAddress)
  //     expect(afterFundWETHBalance).to.equal(beforeFundWETHBalance.sub(investorWithdrawAmount))
  //   })

  // })

  // describe('sender : not investor', () => {

  //   let deployer: Wallet, manager: Wallet, notInvestor: Wallet

  //   let FactoryContractAddress = ''
  //   let FundContractAddress = ''
  //   let NewFundAddress = ''

  //   let fundBytecode = ''

  //   before('get signer', async () => {
  //     [deployer, manager, notInvestor] = await (ethers as any).getSigners()
  //   })
  //   before('load fund bytecode', async () => {
  //     fundBytecode = (await ethers.getContractFactory('XXXFund2')).bytecode
  //   })

  //   it("Deploy XXXFactory Contract", async function () {
  //     const XXXFactory = await ethers.getContractFactory("XXXFactory")
  //     const Factory = await XXXFactory.connect(deployer).deploy()
  //     await Factory.deployed()
  //     FactoryContractAddress = Factory.address
  //   })

  //   it("Deploy XXXFund2 Contract", async function () {
  //     const XXXFund = await ethers.getContractFactory("XXXFund2")
  //     const Fund = await XXXFund.connect(deployer).deploy()
  //     await Fund.deployed()
  //     FundContractAddress = Fund.address
  //   })

  //   it("createFund()", async function () {
  //     const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
  //     await FactoryContract.connect(manager).createFund(manager.address)
  //     const expectedFundAddress = getCreate2Address(FactoryContractAddress, manager.address, fundBytecode)
  //     const savedFundAddress = await FactoryContract.connect(manager).getFundByManager(manager.address)
  //     expect(savedFundAddress).to.equal(expectedFundAddress)
  //     NewFundAddress = expectedFundAddress
  //   })

  //   it("ETH -> WETH", async function () {
  //     const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
  //     const beforeWETHBalance = await WETH9.balanceOf(notInvestor.address)
  //     await WETH9.connect(notInvestor).deposit({
  //               from: notInvestor.address,
  //               value: WETH_CHARGE_AMOUNT
  //           })
  //     const afterWETHBalance = await WETH9.balanceOf(notInvestor.address)
  //     expect(afterWETHBalance).to.equal(beforeWETHBalance.add(WETH_CHARGE_AMOUNT))
  //   })

  //   it("deposit ETH => receive()", async function () {
  //     const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
  //     const beforeWETHBalance = await WETH9.balanceOf(NewFundAddress)
  //     await expect(notInvestor.sendTransaction({
  //       to: NewFundAddress,
  //       value: ethers.utils.parseEther("1.0"), // Sends exactly 1.0 ether
  //     })).to.be.revertedWith('receive() => account is not exist in manager list nor investor list')
  //   })

  //   it("withdraw ETH ( MANAGER_FEE 1% )", async function () {
  //     const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
  //     const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)

  //     const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
  //     await expect(newFundContract.connect(notInvestor)
  //       .withdraw(notInvestor.address, WETH9_MAINNET, WITHDRAW_AMOUNT))
  //       .to.be.revertedWith('withdraw() => account is not exist in manager list nor investor list')
  //   })

  //   it("deposit WETH", async function () {
  //     const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
  //     const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)

  //     await WETH9.connect(notInvestor).approve(NewFundAddress, constants.MaxUint256)
  //     const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
  //     await expect(newFundContract.connect(notInvestor).deposit(notInvestor.address, WETH9_MAINNET, DEPOSIT_AMOUNT))
  //       .to.be.revertedWith('deposit() => account is not exist in manager list nor investor list')
  //   })

  //   it("withdraw WETH ( MANAGER_FEE 1% )", async function () {
  //     const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
  //     const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)
  //     const beforeManagerWETHBalance = await WETH9.balanceOf(notInvestor.address)

  //     const newFundContract = await ethers.getContractAt("XXXFund2", NewFundAddress)
  //     await expect(newFundContract.connect(notInvestor).withdraw(notInvestor.address, WETH9_MAINNET, WITHDRAW_AMOUNT))
  //       .to.be.revertedWith('withdraw() => account is not exist in manager list nor investor list')
  //   })

  // })


  describe('sender : manager investor', () => {

  })

  describe('sender : manager manager', () => {

  })
})