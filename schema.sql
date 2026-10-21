CREATE DATABASE IF NOT EXISTS ReverseLogisticsDB;
USE ReverseLogisticsDB;

CREATE TABLE `category` (
    `CategoryID` INT NOT NULL,
    `CategoryName` VARCHAR(100) NOT NULL,
    PRIMARY KEY (`CategoryID`)
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE `customer` (
    `CustomerID` INT NOT NULL,
    `Name` VARCHAR(100) NOT NULL,
    `Email` VARCHAR(100) DEFAULT NULL,
    `Phone` VARCHAR(15) DEFAULT NULL,
    `Address` VARCHAR(255) DEFAULT NULL,
    `CustomerType` VARCHAR(30) DEFAULT NULL,
    PRIMARY KEY (`CustomerID`),
    UNIQUE KEY `Email` (`Email`)
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_0900_ai_ci;