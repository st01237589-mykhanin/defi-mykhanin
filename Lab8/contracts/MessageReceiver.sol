// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";

contract MessageReceiver is CCIPReceiver {
    bytes32 public lastMessageId;
    uint64 public lastSourceChainSelector;
    address public lastSender;
    string public lastText;
    uint256 public messagesReceived;

    event MessageReceived(
        bytes32 indexed messageId,
        uint64 indexed sourceChainSelector,
        address sender,
        string text
    );

    constructor(address _router) CCIPReceiver(_router) {}

    function _ccipReceive(Client.Any2EVMMessage memory message) internal override {
        lastMessageId = message.messageId;
        lastSourceChainSelector = message.sourceChainSelector;
        lastSender = abi.decode(message.sender, (address));
        lastText = abi.decode(message.data, (string));
        messagesReceived++;

        emit MessageReceived(lastMessageId, lastSourceChainSelector, lastSender, lastText);
    }
}
