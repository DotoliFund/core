// SPDX-License-Identifier: GPL-2.0-or-later
// Inspired by Uniswap
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/v3-periphery/contracts/libraries/Path.sol';
import '@uniswap/v3-periphery/contracts/interfaces/external/IWETH9.sol';
import './interfaces/IRouter.sol';

import './interfaces/IERC20Minimal.sol';
import './interfaces/IDotoliFund.sol';
import './interfaces/IDotoliFactory.sol';
import './base/Token.sol';

//TODO : remove console
import "hardhat/console.sol";

contract DotoliFund is Token, IDotoliFund {
    
    using Path for bytes;

    address public factory;
    address public weth9;
    address public router;

    uint256 public fundIdCount = 0;

    mapping(address => uint256) public managingFund;
    mapping(address => mapping(uint256 => uint256)) public investingFund;
    mapping(address => uint256) public investingFundCount;

    mapping(uint256 => address) public manager;                             //fundId -> manager
    mapping(uint256 => Token[]) public fundTokens;                          //fundId -> fundTokens
    mapping(uint256 => Token[]) public feeTokens;                           //fundId -> feeTokens
    mapping(uint256 => mapping(address => Token[])) public investorTokens;  //fundId -> investor -> investorTokens
    mapping(uint256 => address) public positionOwner;                       // positionOwner[tokenId] => owner of uniswap v3 liquidity position
    mapping(address => uint256[]) public tokenIds;                          // tokenIds[investor] => [ tokenId0, tokenId1, ... ]

    uint256 private unlocked = 1;
    modifier lock() {
        require(unlocked == 1, 'LOCKED');
        unlocked = 0;
        _;
        unlocked = 1;
    }

    constructor(address _factory, address _weth9, address _router) {
        factory = _factory;
        weth9 = _weth9;
        router = _router;
        emit FundCreated();
    }


    fallback(bytes calldata input) external payable returns (bytes memory output) { 
        // when deposit ETH with data
        uint256 amount = msg.value;
        //uint32 num = uint32(bytes4(msg.data));
        console.log(uint256(input));
        //uint256 fundId = abi.decode(bytes(msg.data),(uint256));
        // require(isSubscribed(msg.sender, fundId), 'US');

        // IWETH9(weth9).deposit{value: amount}();
        // increaseToken(investorTokens[fundId][msg.sender], weth9, amount);
        // emit Deposit(msg.sender, weth9, amount);
    }

    receive() external payable {
        if (msg.sender == weth9) {
            // when call IWETH9(weth9).withdraw(amount) in this contract, go into here.
        } else {
            // when deposit ETH with no data
        }
    }

    function _withdraw(address _token, uint256 _amount) private {
        if (_token == weth9) {
            IWETH9(weth9).withdraw(_amount);
            (bool success, ) = payable(msg.sender).call{value: _amount}(new bytes(0));
            require(success, 'FW');
        } else {
            IERC20Minimal(_token).transfer(msg.sender, _amount);
        }
    }

    function createFund() external override returns (uint256 fundId) {
        require(managingFund[msg.sender] == 0, 'FUND_EXISTS');
        fundId = ++fundIdCount;
        managingFund[msg.sender] = fundId;
        uint256 fundCount = investingFundCount[msg.sender];
        investingFund[msg.sender][fundCount] = fundId;
        investingFundCount[msg.sender] += 1;
        emit NewFund(fundId, msg.sender);
    }

    function isSubscribed(address investor, uint256 fundId) public override view returns (bool) {
        uint256 fundCount = investingFundCount[investor];
        for (uint256 i=0; i<fundCount; i++) {
            if (fundId == investingFund[investor][i]) {
                return true;
            }
        }
        return false;
    }

    function subscribedFunds(address investor) external override view returns (uint256[] memory){
        uint256 fundCount = investingFundCount[investor];
        uint256[] memory fundIds;
        fundIds = new uint256[](fundCount);
        for (uint256 i=0; i<fundCount; i++) {
            fundIds[i] = investingFund[investor][i];
        }
        return fundIds;
    }
    
    function subscribe(uint256 fundId) external override lock {
        require(!isSubscribed(msg.sender, fundId), 'AR');
        uint256 fundCount = investingFundCount[msg.sender];
        investingFund[msg.sender][fundCount] = fundId;
        investingFundCount[msg.sender] += 1;
        emit Subscribe(fundId, msg.sender);
    }

    function getInvestorTokens(uint256 fundId, address investor) external override view returns (Token[] memory) {
        return getTokens(investorTokens[fundId][investor]);
    }

    function getFeeTokens(uint256 fundId) external override view returns (Token[] memory) {
        return getTokens(feeTokens[fundId]);
    }

    function getInvestorTokenAmount(uint256 fundId, address investor, address token) public override view returns (uint256) {
        return getTokenAmount(investorTokens[fundId][investor], token);
    }

    function getPositionTokenIds(address investor) external override view returns (uint256[] memory _tokenIds) {
        uint256[] memory _tokenIds = tokenIds[investor];
        return _tokenIds;
    }

    function feeIn(uint256 fundId, address investor, address token, uint256 amount) private {
        increaseToken(feeTokens[fundId], token, amount);
        emit ManagerFeeIn(investor, token, amount);
    }

    function feeOut(uint256 fundId, address token, uint256 amount) external payable override lock {
        require(msg.sender == manager[fundId], 'NM');

        bool isSuccess = decreaseToken(feeTokens[fundId], token, amount);
        if (isSuccess) {
            _withdraw(token, amount);
        }
        emit ManagerFeeOut(token, amount);
    }

    function deposit(uint256 fundId, address _token, uint256 _amount) external payable override lock {
        bool isWhiteListToken = IDotoliFactory(factory).whiteListTokens(_token);
        require(isSubscribed(msg.sender, fundId), 'US');
        require(isWhiteListToken, 'NWT');

        IERC20Minimal(_token).transferFrom(msg.sender, address(this), _amount);
        increaseToken(investorTokens[fundId][msg.sender], _token, _amount);
        emit Deposit(msg.sender, _token, _amount);
    }

    function withdraw(uint256 fundId, address _token, uint256 _amount) external payable override lock {
        uint256 tokenAmount = getTokenAmount(investorTokens[fundId][msg.sender], _token);
        require(isSubscribed(msg.sender, fundId), 'US');
        require(tokenAmount >= _amount, 'NET');

        decreaseToken(investorTokens[fundId][msg.sender], _token, _amount);

        uint256 feeAmount = 0;
        uint256 withdrawAmount = 0;
        uint256 managerFee = IDotoliFactory(factory).managerFee();
        if (msg.sender == manager[fundId]) {
            // manager withdraw is no need manager fee
            feeAmount = 0;
            withdrawAmount = _amount;
            _withdraw(_token, _amount);
        } else {
            // send manager fee.
            feeAmount = _amount * managerFee / 10000 / 100;
            withdrawAmount = _amount - feeAmount;
            _withdraw(_token, withdrawAmount);
            feeIn(fundId, msg.sender, _token, feeAmount);
        }
        emit Withdraw(msg.sender, _token, withdrawAmount, feeAmount);
    }

    function handleSwap(
        uint256 fundId,
        address investor, 
        address swapFrom, 
        address swapTo, 
        uint256 swapFromAmount, 
        uint256 swapToAmount
    ) private {
        decreaseToken(investorTokens[fundId][investor], swapFrom, swapFromAmount);
        increaseToken(investorTokens[fundId][investor], swapTo, swapToAmount);
        emit Swap(investor, swapFrom, swapTo, swapFromAmount, swapToAmount);
    }

    function getLastTokenFromPath(bytes memory path) internal view returns (address) {
        address _tokenOut;

        while (true) {
            bool hasMultiplePools = path.hasMultiplePools();

            if (hasMultiplePools) {
                path = path.skipToken();
            } else {
                (address tokenIn, address tokenOut, uint24 fee) = path.decodeFirstPool();
                _tokenOut = tokenOut;
                break;
            }
        }
        return _tokenOut;
    }

    function swap(IRouter.SwapParams[] calldata trades) external payable override lock {
        for(uint256 i=0; i<trades.length; i++) {
            IRouter.SwapParams memory param = trades[i];
            require(msg.sender == manager[param.fundId], 'NM');

            if (param.swapType == IRouter.SwapType.EXACT_INPUT_SINGLE_HOP) {
                require(IDotoliFactory(factory).whiteListTokens(param.tokenOut), 'NWT');
                uint256 tokenBalance = getInvestorTokenAmount(param.fundId, param.investor, param.tokenIn);
                require(param.amountIn <= tokenBalance, 'NET');

                // approve
                IERC20Minimal(param.tokenIn).approve(router, param.amountIn);

                uint256 amountOut = IRouter(router).swapRouter(param);
                handleSwap(param.fundId, param.investor, param.tokenIn, param.tokenOut, param.amountIn, amountOut);

            } else if (param.swapType == IRouter.SwapType.EXACT_INPUT_MULTI_HOP) {
                address tokenOut = getLastTokenFromPath(param.path);
                (address tokenIn, , ) = param.path.decodeFirstPool();
                require(IDotoliFactory(factory).whiteListTokens(tokenOut), 'NWT');
                uint256 tokenBalance = getInvestorTokenAmount(param.fundId, param.investor, tokenIn);
                require(param.amountIn <= tokenBalance, 'NET');

                // approve
                IERC20Minimal(tokenIn).approve(router, param.amountIn);

                uint256 amountOut = IRouter(router).swapRouter(param);
                handleSwap(param.fundId, param.investor, tokenIn, tokenOut, param.amountIn, amountOut);

            } else if (param.swapType == IRouter.SwapType.EXACT_OUTPUT_SINGLE_HOP) {
                require(IDotoliFactory(factory).whiteListTokens(param.tokenOut), 'NWT');
                uint256 tokenBalance = getInvestorTokenAmount(param.fundId, param.investor, param.tokenIn);
                require(param.amountIn <= tokenBalance, 'NET');

                // approve
                IERC20Minimal(param.tokenIn).approve(router, param.amountInMaximum);

                uint256 amountIn = IRouter(router).swapRouter(param);
                handleSwap(param.fundId, param.investor, param.tokenIn, param.tokenOut, amountIn, param.amountOut);

            } else if (param.swapType == IRouter.SwapType.EXACT_OUTPUT_MULTI_HOP) {
                address tokenIn = getLastTokenFromPath(param.path);
                (address tokenOut, , ) = param.path.decodeFirstPool();
                require(IDotoliFactory(factory).whiteListTokens(tokenOut), 'NWT');
                uint256 tokenBalance = getInvestorTokenAmount(param.fundId, param.investor, tokenIn);
                require(param.amountInMaximum <= tokenBalance, 'NET');

                uint256 amountIn = IRouter(router).swapRouter(param);
                handleSwap(param.fundId, param.investor, tokenIn, tokenOut, amountIn, param.amountOut);
            }
        }
    }

    function mintNewPosition(IRouter.MintParams calldata _params)
        external
        override
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        )
    {
        require(msg.sender == manager[_params.fundId], 'NM');

        bool isToken0WhiteListToken = IDotoliFactory(factory).whiteListTokens(_params.token0);
        bool isToken1WhiteListToken = IDotoliFactory(factory).whiteListTokens(_params.token1);
        require(isToken0WhiteListToken, 'NWT0');
        require(isToken1WhiteListToken, 'NWT1');
        uint256 token0Balance = getInvestorTokenAmount(_params.fundId, _params.investor, _params.token0);
        uint256 token1Balance = getInvestorTokenAmount(_params.fundId, _params.investor, _params.token1);
        require(_params.amount0Desired <= token0Balance, 'NET0');
        require(_params.amount1Desired <= token1Balance, 'NET1');

        IERC20Minimal(_params.token0).approve(router, _params.amount0Desired);
        IERC20Minimal(_params.token1).approve(router, _params.amount1Desired);

        address token0;
        address token1;

        (tokenId, liquidity, token0, token1, amount0, amount1) = IRouter(router).mint(_params);

        decreaseToken(investorTokens[_params.fundId][_params.investor], token0, amount0);
        decreaseToken(investorTokens[_params.fundId][_params.investor], token1, amount1);

        positionOwner[tokenId] = _params.investor;
        tokenIds[_params.investor].push(tokenId);

        emit MintNewPosition(_params.investor, token0, token1, amount0, amount1);
    }

    function increaseLiquidity(IRouter.IncreaseParams calldata _params) 
        external override returns (uint128 liquidity, uint256 amount0, uint256 amount1) 
    {
        require(msg.sender == manager[_params.fundId], 'NM');
        require(_params.investor == positionOwner[_params.tokenId], 'NI');

        bool isToken0WhiteListToken = IDotoliFactory(factory).whiteListTokens(_params.token0);
        bool isToken1WhiteListToken = IDotoliFactory(factory).whiteListTokens(_params.token1);
        require(isToken0WhiteListToken, 'NWT0');
        require(isToken1WhiteListToken, 'NWT1');
        uint256 token0Balance = getInvestorTokenAmount(_params.fundId, _params.investor, _params.token0);
        uint256 token1Balance = getInvestorTokenAmount(_params.fundId, _params.investor, _params.token1);
        require(_params.amount0Desired <= token0Balance, 'NET0');
        require(_params.amount1Desired <= token1Balance, 'NET1');

        IERC20Minimal(_params.token0).approve(router, _params.amount0Desired);
        IERC20Minimal(_params.token1).approve(router, _params.amount1Desired);

        address token0;
        address token1;
        
        (liquidity, token0, token1, 
            amount0, amount1) = IRouter(router).increase(_params);

        decreaseToken(investorTokens[_params.fundId][_params.investor], token0, amount0);
        decreaseToken(investorTokens[_params.fundId][_params.investor], token1, amount1);

        emit IncreaseLiquidity(_params.investor, token0, token1, amount0, amount1);
    }

    function collectPositionFee(IRouter.CollectParams calldata _params) 
        external override returns (uint256 amount0, uint256 amount1) 
    {
        require(msg.sender == positionOwner[_params.tokenId] || msg.sender == manager[_params.fundId], 'NA');
        require(_params.investor == positionOwner[_params.tokenId], 'NI');

        address token0;
        address token1;
        
        (token0, token1, amount0, amount1) = IRouter(router).collect(_params);

        increaseToken(investorTokens[_params.fundId][_params.investor], token0, amount0);
        increaseToken(investorTokens[_params.fundId][_params.investor], token1, amount1);

        emit CollectPositionFee(_params.investor, token0, token1, amount0, amount1);
    }

    function decreaseLiquidity(IRouter.DecreaseParams calldata _params) 
        external override returns (uint256 amount0, uint256 amount1) 
    {
        require(msg.sender == positionOwner[_params.tokenId] || msg.sender == manager[_params.fundId], 'NA');
        require(_params.investor == positionOwner[_params.tokenId], 'NI');

        address token0;
        address token1;
        
        (token0, token1, amount0, amount1) = IRouter(router).decrease(_params);

        increaseToken(investorTokens[_params.fundId][_params.investor], token0, amount0);
        increaseToken(investorTokens[_params.fundId][_params.investor], token1, amount1);

        emit DecreaseLiquidity(_params.investor, token0, token1, amount0, amount1);
    }
}