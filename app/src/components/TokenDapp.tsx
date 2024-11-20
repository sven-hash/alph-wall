import React, { useCallback, useEffect, useMemo } from "react";
import { FC, useState } from "react";
import gridStyles from "../styles/App.module.css";
import { TxStatus } from "./TxStatus";
import { useWallet } from "@alephium/web3-react";
import { hexToString, node, ONE_ALPH } from "@alephium/web3";
import { contractFactory, getGridCoordinates, getIndexFromCoordinates, getPx, gridSize, TokenFaucetConfig } from "@/services/utils";
import { mintPx } from "@/services/token.service";
import { PixelFactoryTypes } from "my-contracts";

const colors = [
  "#FF5733",
  "#33FF57",
  "#3357FF",
  "#FFFF33",
  "#FF33FF",
  "#33FFFF",
  "#FFFFFF",
  "#000000",
  "#888888",
  "#FF8800",
  "#0088FF",
  "#00FF88",
  "#8800FF",
  "#FF0088",
  "#888800",
  "#008888",
];



export const TokenDapp: FC<{
  config: TokenFaucetConfig;
}> = ({ config }) => {
  const { signer, account } = useWallet();
  const addressGroup = config.groupIndex;
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [ongoingTxId, setOngoingTxId] = useState<string>();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedPixel, setSelectedPixel] = useState<number | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [contractState, setContractState] = useState<PixelFactoryTypes.State | null>(null)
  const [pixels, setPixels] = useState( Array(gridSize*gridSize).fill('#333') )
  const [loading, setLoading] = useState(true); // Loading state
  const [eventData, setEventData] = useState<PixelFactoryTypes.PixelSetEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const txStatusCallback = useCallback(
    async (status: node.TxStatus, numberOfChecks: number): Promise<unknown> => {
      if (
        (status.type === "Confirmed" && numberOfChecks > 2) ||
        (status.type === "TxNotFound" && numberOfChecks > 3)
      ) {
        setOngoingTxId(undefined);
      }

      return Promise.resolve();
    },
    [setOngoingTxId]
  );



  useEffect(() => {
   async function subscribeEvent() {
     contractFactory.subscribePixelSetEvent({
       pollingInterval: 1000,
       messageCallback: (event: PixelFactoryTypes.PixelSetEvent): Promise<void> => {
         console.log('got admin updated event:', event);
         setEventData(event); // Update state with the new event data

         const indexNewPx = getIndexFromCoordinates(Number(event.fields.x),Number(event.fields.y))
         setPixels((prevPixels) => {
            const newPixels = [...prevPixels];
            console.log(newPixels)
            newPixels[indexNewPx] = `#${hexToString(event.fields.color)}`
    
            return newPixels;
          });
         return Promise.resolve();
       },
       errorCallback: (error: any, subscription): Promise<void> => {
         console.error('Error received:', error);
         setError(error.message); // Update state with error info
         subscription.unsubscribe();
         return Promise.resolve();
       },
     });
   }

   subscribeEvent();

   // Cleanup if needed
   return () => {
     // Add code to unsubscribe from events if the library supports it
   };
 }, []);


useEffect(() => {
   const initializePixels = async () => {
      setContractState(await contractFactory.fetchState())

     //const initialPixels = await getPx();
     
     console.log(initialPixels)
     setPixels(initialPixels);
     setLoading(false); // Stop loading once initialized
   };

   initializePixels();
 }, []);
console.log(contractState)
  const handlePixelClick = useCallback(

    (index: number) => {
      if (pixels[index] === "#333") {
        setSelectedPixel(index);
        setModalVisible(true);
      }
    },
    [pixels]
  );

  const handleColorClick = useCallback((color: React.SetStateAction<string | null>) => {
    setSelectedColor(color);
  }, []);

  const handleColorSubmit = useCallback(async () => {
    if (selectedPixel !== null && selectedColor) {
      setPixels((prevPixels) => {
        const newPixels = [...prevPixels];
        newPixels[selectedPixel] = selectedColor;
        return newPixels;
      });

      if (signer && contractState !== null) {
        // Get 1-based coordinates
        const [x, y] = getGridCoordinates(selectedPixel);
        // Convert to BigInt and subtract 1 to make 0-based
        const result = await mintPx(
          signer,
          contractState.fields.tokenIdToBurn,
          x,  // Convert to BigInt after subtraction
          y,  // Convert to BigInt after subtraction
          selectedColor,
          contractState.fields.burnMint
        );

        setOngoingTxId(result.txId)
      }
      setModalVisible(false);
      setSelectedColor(null);
      setSelectedPixel(null);
    }
  }, [selectedPixel, selectedColor]);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setSelectedColor(null);
    setSelectedPixel(null);
  }, []);

  const memoizedPixels = useMemo(
    () => 
      pixels.map((color, index) => (
        <div
          key={index}
          className={gridStyles.pixel}
          style={{ backgroundColor: color }}
          onClick={() => handlePixelClick(index)}
          title={`${getGridCoordinates(index)[0]}, ${getGridCoordinates(index)[1]}`}
        />
      )),
    [pixels, handlePixelClick]
  );

  console.log("ongoing..", ongoingTxId);
  return (
    <>
      {ongoingTxId && (
        <TxStatus txId={ongoingTxId} txStatusCallback={txStatusCallback} />
      )}
      
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
   

      {loading && <p style={{color: "whitesmoke"}}>Loading the grid</p>}
      {contractState !== null && <p style={{color: "whitesmoke"}}>Minted px so far: {Number(contractState.fields.numPxMinted)}/{gridSize}</p>}
      {contractState !== null && <p style={{color: "whitesmoke"}}>Burned tokens so far: {Number(contractState.fields.balanceBurn)}</p>}

        <main>
          <div id={gridStyles.gridContainer}>
            <div id={gridStyles.grid}>{memoizedPixels}</div>
          </div>
        </main>
        {modalVisible && (
          <div className={gridStyles.modal}>
            <div className={gridStyles.modalContent}>
              <span className={gridStyles.close} onClick={closeModal}>
                &times;
              </span>
              <h2>
                Select a color for pixel at {`${selectedPixel && getGridCoordinates(selectedPixel)[0]}, ${selectedPixel &&getGridCoordinates(selectedPixel)[1]}`}{" "}
                - Cost: {contractState !== null ? (0.1+Number(contractState.fields.burnMint/ONE_ALPH)).toString() : '0'}
              </h2>
              <div id="colorOptions">
                {colors.map((color) => (
                  <div
                    key={color}
                    className={`${gridStyles.colorOption} ${
                      selectedColor === color ? "selected" : ""
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => handleColorClick(color)}
                  />
                ))}
              </div>
              <button id="submitColor" onClick={handleColorSubmit}>
                Submit
              </button>
            </div>
          </div>
        )}
 
    </>
  );
};
