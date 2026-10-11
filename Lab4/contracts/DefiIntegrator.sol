// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

contract DefiIntegrator {
    using SafeERC20 for IERC20;

    IUniswapV2Router02 public immutable uniswapRouter;

    event LiquidityProvided(
        address indexed provider,
        address indexed tokenA,
        address indexed tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 liquidity
    );
    event TokensSwapped(
        address indexed trader,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    constructor(address _routerAddress) {
        uniswapRouter = IUniswapV2Router02(_routerAddress);
    }

    function provideLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        _pullAndApprove(tokenA, amountADesired);
        _pullAndApprove(tokenB, amountBDesired);

        (amountA, amountB, liquidity) = uniswapRouter.addLiquidity(
            tokenA,
            tokenB,
            amountADesired,
            amountBDesired,
            amountAMin,
            amountBMin,
            msg.sender,
            deadline
        );

        _refund(tokenA, amountADesired - amountA);
        _refund(tokenB, amountBDesired - amountB);

        emit LiquidityProvided(msg.sender, tokenA, tokenB, amountA, amountB, liquidity);
    }

    function swapTokens(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        uint256 deadline
    ) external returns (uint256 amountOut) {
        _pullAndApprove(tokenIn, amountIn);

        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        uint256[] memory amounts = uniswapRouter.swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            path,
            msg.sender,
            deadline
        );
        amountOut = amounts[1];

        emit TokensSwapped(msg.sender, tokenIn, tokenOut, amountIn, amountOut);
    }

    function _pullAndApprove(address token, uint256 amount) private {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).forceApprove(address(uniswapRouter), amount);
    }

    function _refund(address token, uint256 amount) private {
        if (amount > 0) {
            IERC20(token).forceApprove(address(uniswapRouter), 0);
            IERC20(token).safeTransfer(msg.sender, amount);
        }
    }
}
