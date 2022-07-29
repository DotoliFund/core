// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import './interfaces/IXXXFund.sol';
import './interfaces/IERC20Minimal.sol';
import './interfaces/IXXXFactory.sol';

import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';
import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';

contract XXXFund is IXXXFund {

    address swapRouterAddress = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    uint SHARE_DECIMAL = 10 ** 6; 

    struct ReservedToken {
        address tokenAddress;
        string tokenName;
        uint amount;
        uint fiatPrice;
        uint etherPrice;
    }

    struct SwapHistory {
        string date;
        address fundAddress;
        address fundManager;
        address swapFrom;
        address swapTo;
        string swapFromName;
        string swapToName;
        ReservedToken[] reservedTokens;
        uint totalFiatValue;
        uint totalEtherValue;
        uint turnverRatio;
        uint rateOfReturn;
    }

    address public factory;
    address public manager;
    address[] public allTokens;
    mapping(address => uint) public reservedTokens;
    address[] public holders;
    mapping(address => uint) public shares;
    SwapHistory[] public swapHistory;

    ISwapRouter public immutable swapRouter;


    event Deposit(address indexed sender, address _token, uint _amount);
    event Withdraw(address indexed sender, address _token, uint _amount);
    event Swap(
        address indexed sender,
        uint amount0In,
        uint amount1In,
        uint amount0Out,
        uint amount1Out,
        address indexed to
    );


    uint private unlocked = 1;
    modifier lock() {
        require(unlocked == 1, 'XXXFund: LOCKED');
        unlocked = 0;
        _;
        unlocked = 1;
    }

    // Modifier to check that the caller is the manager of
    // the contract.
    modifier onlyManager() {
        require(msg.sender == manager, "Not manager");
        // Underscore is a special character only used inside
        // a function modifier and it tells Solidity to
        // execute the rest of the code.
        _;
    }


    constructor() {
        factory = msg.sender;
        swapRouter = ISwapRouter(swapRouterAddress);
    }
    
    function getFiatPrice(address token) private returns (uint fiatPrice) {
        fiatPrice = 0; 
    }

    function getTotalFiatValue() private returns (uint totalFiatValue) {
        totalFiatValue = 0;
        for (uint i = 0; i < allTokens.length; i++) {
            address token = allTokens[i];
            uint tokenFiatPrice = getFiatPrice(token);
            uint tokenAmount = reservedTokens[token];
            require(tokenFiatPrice >= 0);
            totalFiatValue += tokenFiatPrice * tokenAmount;
        }
    }

    function getReserves(address token) public view returns (uint _reserve) {
        _reserve = reservedTokens[token];
    }

    // called once by the factory at time of deployment
    function initialize(address _manager, address _token, uint256 _amount) override external {
        require(msg.sender == factory, 'XXXFund: FORBIDDEN'); // sufficient check
        require(allTokens.length == 0);
        manager = _manager;

        if (_token != address(0) && _amount > 0) {
            uint share = 1 * SHARE_DECIMAL;
            TransferHelper.safeTransferFrom(_token, manager, address(this), _amount);
            //update share[]
            shares[manager] = share;
            //update allTokens[], reservedTokens[]
            allTokens.push(_token);
            reservedTokens[_token] = _amount;
            emit Deposit(manager, _token, _amount);
        }
    }

    function getFiatAmount(address token, uint256 _amount) private returns (uint fiatAmount) {
        fiatAmount = 0; 
    }

    function getTotalFiatAmount() private returns (uint totalFiatAmount) {
        totalFiatAmount = 0; 
    }

    // this low-level function should be called from a contract which performs important safety checks
    function deposit(address sender, address _token, uint256 _amount) override external lock {
        require(msg.sender == sender); // sufficient check

        uint depositFiatValue = getFiatAmount(_token, _amount);
        uint reservedFiatValue = getTotalFiatAmount();
        uint share = SHARE_DECIMAL * depositFiatValue / (reservedFiatValue + depositFiatValue);

        TransferHelper.safeTransfer(_token, address(this), _amount);
        //update share[]
        for (uint256 i = 0; i < holders.length; i++) {
            shares[holders[i]] = (((SHARE_DECIMAL * 1) - share) * shares[holders[i]]) / SHARE_DECIMAL;
        }
        shares[sender] += share;
        //update allTokens[], reservedTokens[]
        for (uint256 j = 0; j < allTokens.length; j++) {
            address token = allTokens[j];
            if (token == _token) {
                reservedTokens[_token] += _amount;
                emit Deposit(msg.sender, _token, _amount);
                return;
            }
        }
        allTokens.push(_token);
        reservedTokens[_token] = _amount;
        emit Deposit(msg.sender, _token, _amount);
    }

    // this low-level function should be called from a contract which performs important safety checks
    function withdraw(address _token, address to, uint256 _amount) override external lock {
        require(msg.sender == to); // sufficient check
        require(reservedTokens[_token] >= _amount);
        uint withdrawableFiatAmount = shares[to] * getTotalFiatAmount() / SHARE_DECIMAL;
        uint withdrawFiatAmount = getFiatAmount(_token, _amount);
        require(withdrawableFiatAmount >= withdrawFiatAmount);

        uint reservedFiatAmount = getTotalFiatValue();
        uint share = SHARE_DECIMAL * withdrawFiatAmount / reservedFiatAmount;

        TransferHelper.safeTransferFrom(_token, address(this), to, _amount);
        //update share[]
        shares[to] -= share;
        for (uint256 i = 0; i < holders.length; i++) {
            shares[holders[i]] = ((SHARE_DECIMAL + ((SHARE_DECIMAL * share) / (SHARE_DECIMAL - share))) * shares[holders[i]]) / SHARE_DECIMAL;
        }
        //update allTokens[], reservedTokens[]
        for (uint256 j = 0; j < allTokens.length; j++) {
            address token = allTokens[j];
            if (token == _token) {
                reservedTokens[_token] -= _amount;
                emit Withdraw(to, _token, _amount);
                return;
            }
        }
    }

    address public constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address public constant WETH9 = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    // For this example, we will set the pool fee to 0.3%.
    uint24 public constant poolFee = 3000;


    function swapExactInputSingle(ISwapRouter.ExactInputSingleParams calldata _params) onlyManager external returns (uint256 amountOut) {
        // msg.sender must approve this contract

        // Transfer the specified amount of DAI to this contract.
        TransferHelper.safeTransferFrom(DAI, msg.sender, address(this), _params.amountIn);

        // Approve the router to spend DAI.
        TransferHelper.safeApprove(DAI, address(swapRouter), _params.amountIn);

        // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
        // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
        ISwapRouter.ExactInputSingleParams memory params =
            ISwapRouter.ExactInputSingleParams({
                tokenIn: _params.tokenIn,
                tokenOut: _params.tokenOut,
                fee: _params.fee,
                recipient: address(this),
                deadline: _params.deadline,
                amountIn: _params.amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });

        // The call to `exactInputSingle` executes the swap.
        amountOut = swapRouter.exactInputSingle(params);
    }

    function swapExactOutputSingle(ISwapRouter.ExactOutputSingleParams calldata _params) onlyManager external returns (uint256 amountIn) {
        // Transfer the specified amount of DAI to this contract.
        TransferHelper.safeTransferFrom(DAI, msg.sender, address(this), _params.amountInMaximum);

        // Approve the router to spend the specifed `amountInMaximum` of DAI.
        // In production, you should choose the maximum amount to spend based on oracles or other data sources to acheive a better swap.
        TransferHelper.safeApprove(DAI, address(swapRouter), _params.amountInMaximum);

        ISwapRouter.ExactOutputSingleParams memory params =
            ISwapRouter.ExactOutputSingleParams({
                tokenIn: _params.tokenIn,
                tokenOut: _params.tokenOut,
                fee: _params.fee,
                recipient: address(this),
                deadline: _params.deadline,
                amountOut: _params.amountOut,
                amountInMaximum: _params.amountInMaximum,
                sqrtPriceLimitX96: 0
            });

        // Executes the swap returning the amountIn needed to spend to receive the desired amountOut.
        amountIn = swapRouter.exactOutputSingle(params);

        // For exact output swaps, the amountInMaximum may not have all been spent.
        // If the actual amount spent (amountIn) is less than the specified maximum amount, we must refund the msg.sender and approve the swapRouter to spend 0.
        if (amountIn < _params.amountInMaximum) {
            TransferHelper.safeApprove(DAI, address(swapRouter), 0);
            TransferHelper.safeTransfer(DAI, msg.sender, _params.amountInMaximum - amountIn);
        }
    }

    function swapExactInputMultihop(ISwapRouter.ExactInputParams calldata _params) onlyManager external returns (uint256 amountOut) {
        // Transfer `amountIn` of DAI to this contract.
        TransferHelper.safeTransferFrom(DAI, msg.sender, address(this), _params.amountIn);

        // Approve the router to spend DAI.
        TransferHelper.safeApprove(DAI, address(swapRouter), _params.amountIn);

        // Multiple pool swaps are encoded through bytes called a `path`. A path is a sequence of token addresses and poolFees that define the pools used in the swaps.
        // The format for pool encoding is (tokenIn, fee, tokenOut/tokenIn, fee, tokenOut) where tokenIn/tokenOut parameter is the shared token across the pools.
        // Since we are swapping DAI to USDC and then USDC to WETH9 the path encoding is (DAI, 0.3%, USDC, 0.3%, WETH9).
        ISwapRouter.ExactInputParams memory params =
            ISwapRouter.ExactInputParams({
                path: _params.path, //abi.encodePacked(DAI, poolFee, USDC, poolFee, WETH9),
                recipient: address(this),
                deadline: _params.deadline,
                amountIn: _params.amountIn,
                amountOutMinimum: 0
            });

        // Executes the swap.
        amountOut = swapRouter.exactInput(params);
    }

    function swapExactOutputMultihop(ISwapRouter.ExactOutputParams calldata _params) onlyManager external returns (uint256 amountIn) {
        // Transfer the specified `amountInMaximum` to this contract.
        TransferHelper.safeTransferFrom(DAI, msg.sender, address(this), _params.amountInMaximum);
        // Approve the router to spend  `amountInMaximum`.
        TransferHelper.safeApprove(DAI, address(swapRouter), _params.amountInMaximum);

        // The parameter path is encoded as (tokenOut, fee, tokenIn/tokenOut, fee, tokenIn)
        // The tokenIn/tokenOut field is the shared token between the two pools used in the multiple pool swap. In this case USDC is the "shared" token.
        // For an exactOutput swap, the first swap that occurs is the swap which returns the eventual desired token.
        // In this case, our desired output token is WETH9 so that swap happpens first, and is encoded in the path accordingly.
        ISwapRouter.ExactOutputParams memory params =
            ISwapRouter.ExactOutputParams({
                path: _params.path, //abi.encodePacked(WETH9, poolFee, USDC, poolFee, DAI),
                recipient: address(this),
                deadline: block.timestamp,
                amountOut: _params.amountOut,
                amountInMaximum: _params.amountInMaximum
            });

        // Executes the swap, returning the amountIn actually spent.
        amountIn = swapRouter.exactOutput(params);

        // If the swap did not require the full amountInMaximum to achieve the exact amountOut then we refund msg.sender and approve the router to spend 0.
        if (amountIn < _params.amountInMaximum) {
            TransferHelper.safeApprove(DAI, address(swapRouter), 0);
            TransferHelper.safeTransferFrom(DAI, address(this), msg.sender, _params.amountInMaximum - amountIn);
        }
    }
}