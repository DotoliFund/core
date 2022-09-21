import { Wallet, constants, BigNumber } from 'ethers'
import { expect } from "chai";
import { ethers, waffle } from 'hardhat';
import { XXXFactory } from '../typechain-types/contracts/XXXFactory';
import { XXXFund2 } from '../typechain-types/contracts/XXXFund2';
import { getCreate2Address } from './shared/utilities'


const WETH9_MAINNET = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
//const WETH9_RINKEBY = '0xc778417E063141139Fce010982780140Aa0cD5Ab';
const V3_SWAP_ROUTER_ADDRESS = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
const WETH_CHARGE_AMOUNT = ethers.utils.parseEther("100.0");
const DEPOSIT_AMOUNT = ethers.utils.parseEther("1.0");
const WITHDRAW_AMOUNT = ethers.utils.parseEther("0.5");
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


describe('XXXFactory', () => {

  describe('sender : manager', () => {

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

    it("ETH -> WETH", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET);
      const beforeWETHBalance = await WETH9.balanceOf(manager.address)
      await WETH9.connect(manager).deposit({
                from: manager.address,
                value: WETH_CHARGE_AMOUNT
            });
      expect(await WETH9.balanceOf(manager.address)).to.equal(beforeWETHBalance.add(WETH_CHARGE_AMOUNT))
    });

    it("deposit ETH => receive()", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET);
      const beforeWETHBalance = await WETH9.balanceOf(NewFundAddress)
      await manager.sendTransaction({
        to: NewFundAddress,
        value: ethers.utils.parseEther("1.0"), // Sends exactly 1.0 ether
      });
      expect(await WETH9.balanceOf(NewFundAddress)).to.equal(beforeWETHBalance.add(ethers.utils.parseEther("1.0")))
    });

    it("withdraw ETH", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
      const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)

      const newFund = await ethers.getContractAt("XXXFund2", NewFundAddress);
      await newFund.connect(manager).withdraw(manager.address, WETH9_MAINNET, WITHDRAW_AMOUNT);

      const afterFundWETHBalance = await WETH9.balanceOf(NewFundAddress)
      expect(afterFundWETHBalance).to.equal(beforeFundWETHBalance.sub(WITHDRAW_AMOUNT))
    });

    it("deposit WETH", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
      const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)

      await WETH9.connect(manager).approve(NewFundAddress, constants.MaxUint256)
      const newFund = await ethers.getContractAt("XXXFund2", NewFundAddress);
      await newFund.connect(manager).deposit(manager.address, WETH9_MAINNET, DEPOSIT_AMOUNT);

      expect(await WETH9.balanceOf(NewFundAddress)).to.equal(beforeFundWETHBalance.add(DEPOSIT_AMOUNT))
    });

    it("withdraw WETH", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
      const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)
      const beforeManagerWETHBalance = await WETH9.balanceOf(manager.address)

      const newFund = await ethers.getContractAt("XXXFund2", NewFundAddress);
      await newFund.connect(manager).withdraw(manager.address, WETH9_MAINNET, WITHDRAW_AMOUNT);

      expect(await WETH9.balanceOf(NewFundAddress)).to.equal(beforeFundWETHBalance.sub(WITHDRAW_AMOUNT))
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
      await expect(FactoryContract.connect(manager).addInvestorFundList(NewFundAddress)).to.be.revertedWith('addInvestorFundList() => manager cannot add investor fund list')
    });

  })


  describe('sender : investor', () => {
  
    let deployer: Wallet, manager: Wallet, investor: Wallet

    let FactoryContractAddress = ''
    let FundContractAddress = ''
    let NewFundAddress = ''

    let fundBytecode = ''

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

    //investor is different from not investor at addInvestorFundList(), isInvestorFundExist()
    it("not investor yet => isInvestorFundExist()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress);
      expect(await FactoryContract.connect(investor).isInvestorFundExist(investor.address, NewFundAddress)).to.be.false
    });
    it("register investor => addInvestorFundList()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress);
      FactoryContract.connect(investor).addInvestorFundList(NewFundAddress)
    });
    it("now check investor => isInvestorFundExist()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress);
      expect(await FactoryContract.connect(investor).isInvestorFundExist(investor.address, NewFundAddress)).to.be.true
    });

    it("ETH -> WETH", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET);
      const beforeWETHBalance = await WETH9.balanceOf(investor.address)
      await WETH9.connect(investor).deposit({
                from: investor.address,
                value: WETH_CHARGE_AMOUNT
            });
      expect(await WETH9.balanceOf(investor.address)).to.equal(beforeWETHBalance.add(WETH_CHARGE_AMOUNT))
    });

    it("deposit ETH => receive()", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET);
      const beforeWETHBalance = await WETH9.balanceOf(NewFundAddress)
      await investor.sendTransaction({
        to: NewFundAddress,
        value: ethers.utils.parseEther("1.0"), // Sends exactly 1.0 ether
      });
      const afterFundWETHBalance = await WETH9.balanceOf(NewFundAddress)
      expect(afterFundWETHBalance).to.equal(beforeWETHBalance.add(ethers.utils.parseEther("1.0")))
    });

    it("withdraw ETH ( MANAGER_FEE 1% )", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
      const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)

      const newFund = await ethers.getContractAt("XXXFund2", NewFundAddress);
      await newFund.connect(investor).withdraw(investor.address, WETH9_MAINNET, WITHDRAW_AMOUNT);

      const fee = WITHDRAW_AMOUNT.mul(MANAGER_FEE).div(100)
      const investorWithdrawAmount = WITHDRAW_AMOUNT.sub(fee)

      const afterFundWETHBalance = await WETH9.balanceOf(NewFundAddress)
      expect(afterFundWETHBalance).to.equal(beforeFundWETHBalance.sub(investorWithdrawAmount))
    });

    it("deposit WETH", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
      const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)

      await WETH9.connect(investor).approve(NewFundAddress, constants.MaxUint256)
      const newFund = await ethers.getContractAt("XXXFund2", NewFundAddress);
      await newFund.connect(investor).deposit(investor.address, WETH9_MAINNET, DEPOSIT_AMOUNT);

      const afterFundWETHBalance = await WETH9.balanceOf(NewFundAddress)
      expect(afterFundWETHBalance).to.equal(beforeFundWETHBalance.add(DEPOSIT_AMOUNT))
    });

    it("withdraw WETH ( MANAGER_FEE 1% )", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
      const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)
      const beforeManagerWETHBalance = await WETH9.balanceOf(investor.address)

      const newFund = await ethers.getContractAt("XXXFund2", NewFundAddress);
      await newFund.connect(investor).withdraw(investor.address, WETH9_MAINNET, WITHDRAW_AMOUNT);

      const fee = WITHDRAW_AMOUNT.mul(MANAGER_FEE).div(100)
      const investorWithdrawAmount = WITHDRAW_AMOUNT.sub(fee)

      const afterFundWETHBalance = await WETH9.balanceOf(NewFundAddress)
      expect(afterFundWETHBalance).to.equal(beforeFundWETHBalance.sub(investorWithdrawAmount))
    });

    it("getSwapRouterAddress()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(investor).getSwapRouterAddress()).to.equal(V3_SWAP_ROUTER_ADDRESS)
    });

    it("getManagerFee()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(investor).getManagerFee()).to.equal(MANAGER_FEE)
    });

    it("isWhiteListToken()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(investor).isWhiteListToken(WHITE_LIST_TOKENS[0])).to.equal(true)
    });

    it("getWhiteListTokens()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(investor).getWhiteListTokens()).to.have.members(WHITE_LIST_TOKENS)
    });

    it("getFundByManager() investor has no fund", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(investor).getFundByManager(investor.address)).to.equal('0x0000000000000000000000000000000000000000')
    });

    it("isInvestorFundExist()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(investor).isInvestorFundExist(NewFundAddress,investor.address)).to.equal(false)
    });

    it("getInvestorFundList()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      expect(await FactoryContract.connect(investor).getInvestorFundList(investor.address)).to.have.lengthOf(1)
    });

    it("addInvestorFundList()", async function () {
      const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
      await expect(FactoryContract.connect(investor).addInvestorFundList(NewFundAddress)).to.be.revertedWith('addInvestorFundList() => investor fund list already exist')
    });
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

    it("ETH -> WETH", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET);
      const beforeWETHBalance = await WETH9.balanceOf(notInvestor.address)
      await WETH9.connect(notInvestor).deposit({
                from: notInvestor.address,
                value: WETH_CHARGE_AMOUNT
            });
      expect(await WETH9.balanceOf(notInvestor.address)).to.equal(beforeWETHBalance.add(WETH_CHARGE_AMOUNT))
    });

    it("deposit ETH => receive()", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET);
      const beforeWETHBalance = await WETH9.balanceOf(NewFundAddress)
      await expect(notInvestor.sendTransaction({
        to: NewFundAddress,
        value: ethers.utils.parseEther("1.0"), // Sends exactly 1.0 ether
      })).to.be.revertedWith('receive() => account is not exist in manager list nor investor list')
    });

    it("withdraw ETH ( MANAGER_FEE 1% )", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
      const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)

      const newFund = await ethers.getContractAt("XXXFund2", NewFundAddress);
      await expect(newFund.connect(notInvestor)
        .withdraw(notInvestor.address, WETH9_MAINNET, WITHDRAW_AMOUNT))
        .to.be.revertedWith('withdraw() => account is not exist in manager list nor investor list')
    });

    it("deposit WETH", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
      const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)

      await WETH9.connect(notInvestor).approve(NewFundAddress, constants.MaxUint256)
      const newFund = await ethers.getContractAt("XXXFund2", NewFundAddress);
      await expect(newFund.connect(notInvestor).deposit(notInvestor.address, WETH9_MAINNET, DEPOSIT_AMOUNT))
        .to.be.revertedWith('deposit() => account is not exist in manager list nor investor list')
    });

    it("withdraw WETH ( MANAGER_FEE 1% )", async function () {
      const WETH9 = await ethers.getContractAt("IWETH9", WETH9_MAINNET)
      const beforeFundWETHBalance = await WETH9.balanceOf(NewFundAddress)
      const beforeManagerWETHBalance = await WETH9.balanceOf(notInvestor.address)

      const newFund = await ethers.getContractAt("XXXFund2", NewFundAddress);
      await expect(newFund.connect(notInvestor).withdraw(notInvestor.address, WETH9_MAINNET, WITHDRAW_AMOUNT))
        .to.be.revertedWith('withdraw() => account is not exist in manager list nor investor list')
    });








    // it("getSwapRouterAddress()", async function () {
    //   const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    //   expect(await FactoryContract.connect(notInvestor).getSwapRouterAddress()).to.equal(V3_SWAP_ROUTER_ADDRESS)
    // });

    // it("getManagerFee()", async function () {
    //   const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    //   expect(await FactoryContract.connect(notInvestor).getManagerFee()).to.equal(MANAGER_FEE)
    // });

    // it("isWhiteListToken()", async function () {
    //   const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    //   expect(await FactoryContract.connect(notInvestor).isWhiteListToken(WHITE_LIST_TOKENS[0])).to.equal(true)
    // });

    // it("getWhiteListTokens()", async function () {
    //   const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    //   expect(await FactoryContract.connect(notInvestor).getWhiteListTokens()).to.have.members(WHITE_LIST_TOKENS)
    // });

    // it("getFundByManager()", async function () {
    //   const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    //   expect(await FactoryContract.connect(notInvestor).getFundByManager(notInvestor.address)).to.equal(NewFundAddress)
    // });

    // it("isInvestorFundExist()", async function () {
    //   const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    //   expect(await FactoryContract.connect(notInvestor).isInvestorFundExist(NewFundAddress,notInvestor.address)).to.equal(false)
    // });

    // it("getInvestorFundList()", async function () {
    //   const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    //   expect(await FactoryContract.connect(notInvestor).getInvestorFundList(notInvestor.address)).to.be.empty
    // });

    // it("addInvestorFundList()", async function () {
    //   const FactoryContract = await ethers.getContractAt("XXXFactory", FactoryContractAddress)
    //   await expect(FactoryContract.connect(notInvestor).addInvestorFundList(NewFundAddress)).to.be.revertedWith('XXXFactory: Manager cannot add investor fund list')
    // });
  })
})