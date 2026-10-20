// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract CrossChainMessenger is Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant DESTINATION_GAS_LIMIT = 200_000;

    IRouterClient public immutable ccipRouter;
    IERC20 public immutable linkToken;

    event MessageSent(
        bytes32 indexed messageId,
        uint64 indexed destinationChainSelector,
        address receiver,
        string text,
        uint256 feePaid
    );

    constructor(address _router, address _link) Ownable(msg.sender) {
        ccipRouter = IRouterClient(_router);
        linkToken = IERC20(_link);
    }

    function sendMessage(
        uint64 _destinationChainSelector,
        address _receiver,
        string calldata _text
    ) external onlyOwner returns (bytes32 messageId) {
        Client.EVM2AnyMessage memory evm2AnyMessage = _buildCCIPMessage(_receiver, _text);

        uint256 fees = ccipRouter.getFee(_destinationChainSelector, evm2AnyMessage);

        if (_paysInNative()) {
            require(address(this).balance >= fees, "Not enough ETH for fees");
            messageId = ccipRouter.ccipSend{value: fees}(_destinationChainSelector, evm2AnyMessage);
        } else {
            require(linkToken.balanceOf(address(this)) >= fees, "Not enough LINK for fees");
            linkToken.forceApprove(address(ccipRouter), fees);
            messageId = ccipRouter.ccipSend(_destinationChainSelector, evm2AnyMessage);
        }

        emit MessageSent(messageId, _destinationChainSelector, _receiver, _text, fees);
    }

    function getFee(
        uint64 _destinationChainSelector,
        address _receiver,
        string calldata _text
    ) external view returns (uint256) {
        return ccipRouter.getFee(_destinationChainSelector, _buildCCIPMessage(_receiver, _text));
    }

    function withdraw(address payable _to) external onlyOwner {
        if (_paysInNative()) {
            (bool success, ) = _to.call{value: address(this).balance}("");
            require(success, "ETH transfer failed");
        } else {
            linkToken.safeTransfer(_to, linkToken.balanceOf(address(this)));
        }
    }

    receive() external payable {}

    function _paysInNative() private view returns (bool) {
        return address(linkToken) == address(0);
    }

    function _buildCCIPMessage(
        address _receiver,
        string calldata _text
    ) private view returns (Client.EVM2AnyMessage memory) {
        return Client.EVM2AnyMessage({
            receiver: abi.encode(_receiver),
            data: abi.encode(_text),
            tokenAmounts: new Client.EVMTokenAmount[](0),
            extraArgs: Client._argsToBytes(
                Client.GenericExtraArgsV2({gasLimit: DESTINATION_GAS_LIMIT, allowOutOfOrderExecution: true})
            ),
            feeToken: address(linkToken)
        });
    }
}
