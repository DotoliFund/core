import { expect } from "chai";
import { ethers } from 'hardhat';
import { XXXFund } from '../typechain-types/contracts/XXXFund';



describe('XXXFund', () => {

  it("createFund", async function () {
    const [owner] = await ethers.getSigners();

    const XXXFund = await ethers.getContractFactory("XXXFund");

    const hardhatXXXFund = await XXXFund.deploy();


  });

})