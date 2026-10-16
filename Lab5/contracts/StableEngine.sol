// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./StableCoin.sol";

contract StableEngine is Ownable {
    StableCoin public immutable kUsd;

    uint256 public constant COLLATERAL_RATIO = 150;
    uint256 public constant MIN_HEALTH_FACTOR = 1e18;

    uint256 public mockEthUsdPrice = 2000e18;

    mapping(address => uint256) public collateralDeposited;
    mapping(address => uint256) public kUsdMinted;

    event CollateralDeposited(address indexed user, uint256 amount);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event StablecoinMinted(address indexed user, uint256 amount);
    event StablecoinBurned(address indexed user, uint256 amount);
    event OraclePriceUpdated(uint256 newPrice);

    constructor(address _kUsdAddress) Ownable(msg.sender) {
        kUsd = StableCoin(_kUsdAddress);
    }

    function depositCollateral() external payable {
        require(msg.value > 0, "Needs more than 0");
        collateralDeposited[msg.sender] += msg.value;
        emit CollateralDeposited(msg.sender, msg.value);
    }

    function mintStablecoin(uint256 _kUsdAmount) external {
        require(_kUsdAmount > 0, "Needs more than 0");

        kUsdMinted[msg.sender] += _kUsdAmount;
        _revertIfHealthFactorIsBroken(msg.sender);

        kUsd.mint(msg.sender, _kUsdAmount);
        emit StablecoinMinted(msg.sender, _kUsdAmount);
    }

    function burnStablecoin(uint256 amount) external {
        require(amount > 0, "Needs more than 0");
        require(amount <= kUsdMinted[msg.sender], "Burn amount exceeds debt");

        kUsdMinted[msg.sender] -= amount;
        kUsd.burn(msg.sender, amount);
        emit StablecoinBurned(msg.sender, amount);
    }

    function withdrawCollateral(uint256 amount) external {
        require(amount > 0, "Needs more than 0");
        require(amount <= collateralDeposited[msg.sender], "Insufficient collateral");

        collateralDeposited[msg.sender] -= amount;
        _revertIfHealthFactorIsBroken(msg.sender);

        emit CollateralWithdrawn(msg.sender, amount);
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "ETH transfer failed");
    }

    function setMockOraclePrice(uint256 _newPrice) external onlyOwner {
        mockEthUsdPrice = _newPrice;
        emit OraclePriceUpdated(_newPrice);
    }

    function getHealthFactor(address user) public view returns (uint256) {
        uint256 debt = kUsdMinted[user];
        if (debt == 0) return type(uint256).max;

        uint256 collateralValueInUsd = getUsdValue(collateralDeposited[user]);
        uint256 collateralAdjustedForThreshold = (collateralValueInUsd * 100) / COLLATERAL_RATIO;

        return (collateralAdjustedForThreshold * 1e18) / debt;
    }

    function getUsdValue(uint256 ethAmount) public view returns (uint256) {
        return (ethAmount * mockEthUsdPrice) / 1e18;
    }

    function _revertIfHealthFactorIsBroken(address user) internal view {
        uint256 userHealthFactor = getHealthFactor(user);
        require(userHealthFactor >= MIN_HEALTH_FACTOR, "Health factor is broken (under 1.0)");
    }
}
